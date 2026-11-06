import type { World } from "../core/types";
import type { View } from "../rendering/scene";
import { recruit, expedition } from "../hunters/contracts";
import { equip } from "../inventory/equipment";
import { cutTree } from "../simulation/engine";
import { save, serialize } from "../persistence/save";
import { SPECIES } from "../creatures/species";
import { chunkKey, trees, CHUNK } from "../terrain/fields";
import { hunterDamage } from "../combat/combat";
const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export class HUD {
  panel = "welcome";
  selected = "";
  speed = 1;
  region = { x: 36, z: 10 };
  message = "";
  private last = "";
  constructor(
    private w: World,
    private view: View,
  ) {
    document.querySelector("#hud")!.innerHTML =
      `<header><div class="brand"><span class="sigil">W</span><div><b>WILDHAVEN</b><small>VALEVERDE <i>ALPHA 0.1</i></small></div></div><div id="resources"></div><div class="clock" id="clock"></div></header><nav><button data-action="village">⌂ <span>Vila</span></button><button data-action="guild">♜ <span>Guilda</span><em id="badge"></em></button><button data-action="inventory">♧ <span>Inventário</span></button><button data-action="map">⌘ <span>Regiões</span></button><button data-action="journal">≋ <span>Diário</span></button></nav><aside id="panel"></aside><div class="region"><small>TERRAS DE VALEVERDE</small><strong id="regionname">Refúgio dos cedros</strong><span id="regioncoords"></span></div><div id="toast" role="status"></div><footer><span>Arraste para explorar <b>·</b> Scroll para zoom <b>·</b> Clique para inspecionar</span><div><button data-action="speed">1×</button><button data-action="pause">Ⅱ</button><button data-action="save">Salvar</button><button data-action="export">Exportar</button><button data-action="quality">Qualidade alta</button><span id="perf"></span></div></footer>`;
    document.querySelector("#hud")!.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-action]",
      );
      if (el) this.action(el.dataset.action!, el);
    });
  }
  select(id: string) {
    this.selected = id;
    this.view.selected = id;
    this.panel = "selection";
    this.last = "";
    this.update();
  }
  private action(action: string, el: HTMLElement) {
    const w = this.w,
      h = w.hunters.find(
        (h) => h.id === el.dataset.id || h.id === this.selected,
      );
    if (["guild", "inventory", "map", "journal"].includes(action)) {
      this.panel = this.panel === action ? "" : action;
      this.last = "";
    } else if (action === "close") this.panel = "";
    else if (action === "village") {
      this.view.focus(0, 0);
      this.panel = "";
    } else if (action === "select") this.select(el.dataset.id!);
    else if (action === "recruit" || action === "decline") {
      if (recruit(w, el.dataset.id!, action === "recruit")) {
        this.selected = el.dataset.id!;
        this.panel = "selection";
        this.notify(
          action === "recruit"
            ? "Contrato assinado. Equipe a lança antes de caçar."
            : "Contrato recusado.",
        );
      }
    } else if (action === "equip" && h) {
      this.notify(
        equip(w, h.id, "item-spear-1")
          ? "Lança equipada: +8 de dano."
          : "A lança já está com outro Hunter.",
      );
    } else if (action === "hunt" && h) {
      if (expedition(w, h.id, this.region.x, this.region.z)) {
        this.view.followId = h.id;
        this.notify("Expedição iniciada. A câmera está acompanhando o Hunter.");
      }
    } else if (action === "follow") {
      this.view.followId = el.dataset.id!;
      const e = [...w.creatures, ...w.hunters].find(
        (e) => e.id === el.dataset.id,
      );
      if (e) {
        this.view.focus(e.x, e.z);
        this.view.followId = e.id;
      }
    } else if (action === "demo") {
      this.select("fauna-001");
      const c = w.creatures[0];
      this.view.focus(c.x, c.z);
      this.view.followId = c.id;
    } else if (action === "region") {
      this.region = { x: Number(el.dataset.x), z: Number(el.dataset.z) };
      this.view.focus(this.region.x, this.region.z);
      this.notify("Região selecionada como destino da próxima caçada.");
    } else if (action === "cut") {
      this.notify(
        cutTree(w, el.dataset.id!)
          ? "Madeira coletada. Alteração salva no mundo."
          : "Árvore já cortada.",
      );
      this.persist();
    } else if (action === "forestry") {
      const t = trees(0, 0, w.seed).find((t) => !w.environment[t.id]);
      if (t) {
        this.select(t.id);
        this.view.focus(t.x, t.z);
      }
    } else if (action === "save") this.persist();
    else if (action === "export") {
      const a = document.createElement("a");
      const url = URL.createObjectURL(
        new Blob([serialize(w)], { type: "application/json" }),
      );
      a.href = url;
      a.download = "wildhaven-save.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (action === "speed") {
      this.speed = this.speed === 1 ? 3 : this.speed === 3 ? 6 : 1;
      el.textContent = `${this.speed}×`;
    } else if (action === "pause") {
      this.speed = this.speed ? 0 : 1;
      el.textContent = this.speed ? "Ⅱ" : "▶";
    } else if (action === "quality") {
      const low = el.textContent === "Qualidade alta";
      this.view.quality(low);
      el.textContent = low ? "Qualidade leve" : "Qualidade alta";
    }
    this.last = "";
    this.update();
  }
  persist() {
    try {
      save(this.w);
      this.notify("Mundo salvo neste navegador.");
    } catch {
      this.notify(
        "Não foi possível salvar. Use Exportar para guardar uma cópia.",
      );
    }
  }
  notify(s: string) {
    this.message = s;
    document.querySelector("#toast")!.textContent = s;
    setTimeout(() => {
      if (this.message === s)
        document.querySelector("#toast")!.textContent = "";
    }, 5000);
  }
  update() {
    const w = this.w;
    document.querySelector("#resources")!.innerHTML =
      `<span>⌁ <b>${w.resources.wood}</b><small>Madeira</small></span><span>♧ <b>${w.resources.food}</b><small>Alimento</small></span><span>◇ <b>${w.resources.materials}</b><small>Materiais</small></span><span>◉ <b>${w.resources.coins}</b><small>Moedas</small></span>`;
    const minutes = Math.floor(7 * 60 + w.time / 3);
    document.querySelector("#clock")!.innerHTML =
      `☀ ${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}<small>Dia ${1 + Math.floor(minutes / 1440)} · ${w.hunters.filter((h) => h.ownerId).length} Hunters</small>`;
    document.querySelector("#badge")!.textContent = w.hunters.some(
      (h) => h.status === "visitante",
    )
      ? "•"
      : "";
    const coords = chunkKey(
      this.view.controls.target.x,
      this.view.controls.target.z,
    );
    document.querySelector("#regioncoords")!.textContent =
      `Região ${coords} · Seed ${w.seed}`;
    document.querySelector("#regionname")!.textContent =
      this.view.controls.target.z > 50
        ? "Colinas da Bruma"
        : this.view.controls.target.x > 55
          ? "Margens do Rio Claro"
          : Math.hypot(
                this.view.controls.target.x,
                this.view.controls.target.z,
              ) < 25
            ? "Vila de Valeverde"
            : "Bosque dos cervalhos";
    const mem = (
      performance as Performance & { memory?: { usedJSHeapSize: number } }
    ).memory;
    document.querySelector("#perf")!.textContent =
      `${this.view.fps} FPS · ${this.view.renderer.info.render.calls} draws${mem ? ` · ${Math.round(mem.usedJSHeapSize / 1048576)} MB JS` : ""}`;
    let content = "";
    const title = (k: string, t: string) =>
      `<button class="close" data-action="close" aria-label="Fechar">×</button><small class="eyebrow">${k}</small><h1>${t}</h1>`;
    if (this.panel === "welcome")
      content =
        title("UM MUNDO QUE CONTINUA", "Seu refúgio começa aqui.") +
        `<p>Entre a floresta e o rio, uma pequena vila espera seus primeiros Hunters.</p><div class="objective"><b>01</b><span>Recrute uma viajante na guilda.<small>Ela está caminhando até a vila.</small></span></div><div class="objective"><b>02</b><span>Equipe a lança e envie uma caçada.<small>Acompanhe cada encontro no terreno.</small></span></div><div class="objective"><b>03</b><span>Explore um ecossistema vivo.<small>As criaturas mantêm sua identidade.</small></span></div><button class="primary" data-action="guild">Abrir a guilda →</button><button data-action="demo">Observar travessia de uma criatura</button><p class="fine">Simulação local • salvamento automático • até 30 minutos de progresso ao reabrir.</p>`;
    if (this.panel === "guild")
      content =
        title("GUILDA DOS HUNTERS", "Pessoas, não unidades.") +
        `<p>Contratos individuais. Atributos naturais permanentes.</p>` +
        w.hunters
          .filter((h) => h.status !== "recusado")
          .map(
            (h) =>
              `<button class="card" data-action="select" data-id="${h.id}"><span class="portrait">${h.name[0]}</span><span><b>${h.name}</b><small>${h.phase}</small><small>${h.ownerId ? "Hunter da vila" : h.status === "visitante" ? "Carta disponível · contrato: 20 moedas" : "Visitante a caminho"}</small></span><span>↗</span></button>`,
          )
          .join("");
    if (this.panel === "selection") {
      const h = w.hunters.find((h) => h.id === this.selected),
        c = w.creatures.find((c) => c.id === this.selected);
      if (h) {
        content =
          title(
            h.ownerId ? "HUNTER DE VALEVERDE" : "CARTA DE APRESENTAÇÃO",
            h.name,
          ) +
          `<p>“Venho das ${h.origin.toLowerCase()}. Procuro uma vila onde minhas caçadas façam diferença.”</p><div class="tags"><span>${h.personality}</span><span>${h.talent}</span></div><small class="eyebrow">ATRIBUTOS NATURAIS · IMUTÁVEIS</small><div class="stats">${Object.entries(
            h.natural,
          )
            .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`)
            .join(
              "",
            )}</div><p class="fine">Afinidade: ${h.affinity}<br>Limitação: ${h.limitation}<br>ID: ${h.id}</p><div class="health"><i style="width:${(100 * h.hp) / h.maxHp}%"></i></div><p>${Math.ceil(h.hp)} / ${h.maxHp} PV · Dano ${hunterDamage(w, h).toFixed(1)}<br><b>${h.phase}</b></p>`;
        if (h.status === "visitante")
          content += `<button class="primary" data-action="recruit" data-id="${h.id}" ${w.resources.coins < 20 ? "disabled" : ""}>Assinar contrato · 20 moedas</button><button data-action="decline" data-id="${h.id}">Recusar</button>`;
        if (h.ownerId)
          content += `<button data-action="equip" data-id="${h.id}">${h.equipment ? "✓ Lança de freixo equipada" : "Equipar lança de freixo · +8 dano"}</button><button class="primary" data-action="hunt" data-id="${h.id}" ${h.status !== "contratado" ? "disabled" : ""}>Iniciar caçada · região ${chunkKey(this.region.x, this.region.z)}</button><p class="fine">Abates: ${h.kills} · Carga: ${h.haul}<br>${h.history.slice(-2).map(esc).join("<br>")}</p>`;
        content += `<button data-action="follow" data-id="${h.id}">◎ Acompanhar no mundo</button>`;
      } else if (c) {
        content =
          title("FAUNA AUTÔNOMA", SPECIES[c.species].name) +
          `<p>${c.species === "cervalho" ? "Herbívoro das clareiras. Pasta e foge de ameaças." : c.species === "rasteiro" ? "Carnívoro oportunista. Persegue presas menores." : "Predador territorial do topo da cadeia."}</p><div class="stats"><div>Vida <b>${Math.ceil(c.hp)}</b></div><div>Fome <b>${Math.round(c.hunger)}%</b></div><div>Sede <b>${Math.round(c.thirst)}%</b></div><div>Energia <b>${Math.round(c.energy)}%</b></div></div><p>Estado: <b>${c.state}</b><br>Identidade: ${c.id}<br>Região: ${chunkKey(c.x, c.z)}<br>Travessias registradas: <b>${c.crossed}</b></p><button class="primary" data-action="follow" data-id="${c.id}">◎ Acompanhar criatura</button>`;
      } else if (this.selected.startsWith("tree:"))
        content =
          title("MANEJO DO BOSQUE", "Cedro de Valeverde") +
          `<p>O corte gera 5 unidades de madeira. Um toco permanece no local, mesmo após descarregar a região ou reabrir o jogo.</p><p class="fine">${esc(this.selected)}</p><button class="primary" data-action="cut" data-id="${esc(this.selected)}" ${w.environment[this.selected] ? "disabled" : ""}>${w.environment[this.selected] ? "Árvore já cortada" : "Cortar árvore · +5 madeira"}</button>`;
      else
        content =
          title(
            "VILA DE VALEVERDE",
            this.selected === "guild"
              ? "Guilda dos Hunters"
              : this.selected === "lodge"
                ? "Alojamento"
                : "Depósito",
          ) +
          `<p>Uma construção integrada ao mundo.</p><button data-action="guild">Ver Hunters</button><button data-action="inventory">Ver recursos</button>`;
    }
    if (this.panel === "inventory")
      content =
        title("DEPÓSITO DA VILA", "Tudo tem uma origem.") +
        `<p>Materiais de caçada: <b>${w.resources.materials}</b><br>Madeira: <b>${w.resources.wood}</b><br>Alimento: <b>${w.resources.food}</b></p><div class="card"><span class="portrait">↟</span><span><b>Lança de freixo</b><small>+8 dano · ${w.items[0].equippedBy || "Disponível no depósito"}</small></span></div><p class="fine">Selecione um Hunter contratado para equipar. Os atributos naturais não mudam.</p><button data-action="forestry">Encontrar árvore para coletar madeira</button>`;
    if (this.panel === "map")
      content =
        title("ATLAS DE VALEVERDE", "O mundo é conectado.") +
        `<p>Selecione uma região para observar e definir o destino da próxima expedição.</p><div class="mapgrid">${[-1, 0, 1, 2].flatMap((z) => [-1, 0, 1, 2].map((x) => `<button data-action="region" data-x="${x * CHUNK + 24}" data-z="${z * CHUNK + 24}" class="${x === 1 ? "river" : ""}"><b>${x === 0 && z === 0 ? "⌂" : x === 1 ? "≈" : z > 0 ? "△" : "♧"}</b><small>${x}, ${z}</small></button>`)).join("")}</div><p class="fine">A grade é somente um atlas. O terreno não possui divisões visíveis. ${this.view.chunks.chunks.size} chunks renderizados; todas as ${w.creatures.length} identidades continuam na simulação.</p><button data-action="demo">Inspecionar fauna-001 e suas travessias</button>`;
    if (this.panel === "journal")
      content =
        title("REGISTRO DO MUNDO", "A vida deixa rastros.") +
        w.events
          .slice(0, 12)
          .map(
            (e) =>
              `<div class="entry"><small>+${Math.floor(e.time)}s</small><p>${esc(e.text)}</p></div>`,
          )
          .join("");
    const panel = document.querySelector("#panel")!;
    panel.classList.toggle("hidden", !this.panel);
    if (content !== this.last) {
      panel.innerHTML = content;
      this.last = content;
    }
  }
}
