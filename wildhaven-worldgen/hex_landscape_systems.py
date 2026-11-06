"""Geologia cênica reutilizável para hexágonos Wildhaven.

As malhas são triângulos reais, ancorados à função de altura do gerador.
Separação intencional: este arquivo NÃO modifica Auralis nem a Alpha 0.1.
"""
from __future__ import annotations

import math
import random


ROCK_PALETTE = (
    (151, 148, 130, 255), (167, 158, 137, 255),
    (131, 137, 129, 255), (181, 167, 141, 255),
    (116, 124, 118, 255),
)
WET_ROCK = (101, 121, 115, 255)
SEDIMENT = (176, 157, 114, 255)


def slope_at(height, x, z, step=1.25):
    """Tangente do declive calculada na superfície, não na malha de render."""
    return math.hypot(
        (height(x + step, z) - height(x - step, z)) / (2 * step),
        (height(x, z + step) - height(x, z - step)) / (2 * step),
    )


def slope_class(slope):
    if slope < .35:
        return "suave"
    if slope < .8:
        return "moderado"
    if slope < 1.75:
        return "acentuado"
    return "escarpa"


def _facet_rock(add, height, x, z, r, rng, group, palette=ROCK_PALETTE,
                waterline=None):
    """Bloco angular fechado, com a base penetrando no substrato.
    No contato com a água, parte do volume fica submersa.
    """
    sides = rng.choice((7, 8, 9))
    angles = [2 * math.pi * i / sides for i in range(sides)]
    rot = rng.uniform(-math.pi, math.pi)
    stretch = rng.uniform(.72, 1.28)
    y = height(x, z)
    if waterline is not None:
        y = min(y, waterline + .26 * r)
    bottom = []
    shoulder = []
    crown = []
    for i, a in enumerate(angles):
        a += rot
        spread = r * rng.uniform(.76, 1.17)
        dx = math.cos(a) * spread
        dz = math.sin(a) * spread * stretch
        ground = height(x + dx, z + dz)
        bottom.append([x + dx, min(y, ground) - r * .42, z + dz])
        shoulder.append([x + .84 * dx, y + r * rng.uniform(.19, .43), z + .84 * dz])
        crown.append([x + .44 * dx, y + r * rng.uniform(.69, 1.04), z + .44 * dz])
    vertices = bottom + shoulder + crown
    vertices.append([x + rng.uniform(-.14, .14) * r,
                     y + r * rng.uniform(1.03, 1.38),
                     z + rng.uniform(-.14, .14) * r])
    tris = []
    for i in range(sides):
        j = (i + 1) % sides
        tris.extend((
            [i, j, sides + j], [i, sides + j, sides + i],
            [sides + i, sides + j, 2 * sides + j],
            [sides + i, 2 * sides + j, 2 * sides + i],
            [2 * sides + i, 2 * sides + j, 3 * sides],
        ))
    base = rng.choice(palette)
    colors = []
    for index in range(len(vertices)):
        s = rng.randrange(-9, 10)
        rgb = tuple(max(0, min(255, v + s)) for v in base[:3])
        colors.append((*rgb, 255))
    add(group, vertices, tris, colors)


def _bedrock_skin(add, height, x, z, rx, rz, rng, name):
    """Laje poligonal encaixada na topografia, jamais decal/textura."""
    n = 11
    a0 = rng.random() * math.tau
    center = [x, height(x, z) + rng.uniform(.22, .42), z]
    middle, edge = [], []
    for i in range(n):
        a = a0 + i * math.tau / n
        jitter = rng.uniform(.77, 1.14)
        dx, dz = math.cos(a) * rx * jitter, math.sin(a) * rz * jitter
        middle.append([x + .55 * dx,
                       height(x + .55 * dx, z + .55 * dz) + rng.uniform(.14, .40),
                       z + .55 * dz])
        edge.append([x + dx, height(x + dx, z + dz) + .065, z + dz])
    verts = [center] + middle + edge
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.extend(((0, 1 + i, 1 + j),
                      (1 + i, 1 + n + i, 1 + n + j),
                      (1 + i, 1 + n + j, 1 + j)))
    base = rng.choice(ROCK_PALETTE)
    cols = []
    for i in range(len(verts)):
        t = rng.uniform(-15, 12)
        cols.append(tuple(max(0, min(255, int(v + t))) for v in base[:3]) + (255,))
    add(name, verts, faces, cols)


def _river_edges(add, height, center_x, inside, rng):
    """Faixas angulares de cascalho/rocha que seguem AMBAS as margens."""
    sections = 0
    for side in (-1, 1):
        vertices, colors, faces = [], [], []
        last_pair = None
        for n in range(191):
            z = -95 + n
            x = center_x(z)
            wave = .8 * math.sin(z * .09)
            inner = 6.7 + wave + rng.uniform(-.18, .18)
            outer = 11.1 + wave + rng.uniform(-.55, .55)
            xi, xo = x + side * inner, x + side * outer
            if not (inside(xi, z, 1) and inside(xo, z, 1)):
                last_pair = None
                continue
            begin = len(vertices)
            # A rocha surge do leito úmido e sobe até a grama da encosta.
            for px, offset, color in ((xi, .08, WET_ROCK),
                                      (xo, .065, rng.choice(ROCK_PALETTE))):
                vertices.append([px, height(px, z) + offset, z])
                colors.append(color)
            if last_pair is not None:
                faces.extend(((last_pair, last_pair + 1, begin + 1),
                              (last_pair, begin + 1, begin)))
                sections += 1
            last_pair = begin
        if faces:
            add("geology-riverbank-left" if side < 0 else "geology-riverbank-right",
                vertices, faces, colors)
    return sections


def _falls_bedrock(add, height, baseline, center_x, inside, rng):
    """Arcabouço rochoso das quedas, não uma parede repetida no rio todo."""
    entries = []
    for index, z in enumerate((-59., -16., 38.)):
        x = center_x(z)
        top = baseline(x, z - .35) - .35
        bottom = baseline(x, z + .35) - .35
        if top - bottom < .9:
            continue
        # Atrás da lâmina, triângulos irregulares com patamares e fissuras.
        for side in (-1, 1):
            for band in range(4):
                bx = x + side * (5.8 + 2.35 * band)
                bz = z + rng.uniform(-.7, .7)
                if not inside(bx, bz, 2):
                    continue
                _facet_rock(add, height, bx, bz,
                            rng.uniform(1.35, 3.65),
                            rng, "geology-fall-buttresses")
                if band in (1, 3):
                    _bedrock_skin(add, height, bx, bz + .7,
                                  rng.uniform(2.4, 4.8), 2.9,
                                  rng, "geology-fall-strata")
        # Superfície vertical rochosa imediatamente atrás da cascata.
        verts, faces, colors = [], [], []
        steps = 15
        for i in range(steps + 1):
            u = i / steps
            xx = x + (u - .5) * 11.6
            back = z + .56 + .24 * math.sin(u * 19 + index)
            verts.extend(([xx, top - rng.uniform(.18, .42), back],
                          [xx, bottom - rng.uniform(.1, .45), back + .12]))
            colors.extend((rng.choice(ROCK_PALETTE), rng.choice(ROCK_PALETTE)))
            if i:
                k = 2 * i
                faces.extend(((k - 2, k, k + 1), (k - 2, k + 1, k - 1)))
        add("geology-fall-cliff", verts, faces, colors)
        # Seixos úmidos após o impacto, deixando o canal aberto.
        for i in range(16):
            zz = z + rng.uniform(1, 7)
            bx = center_x(zz) + rng.choice((-1, 1)) * rng.uniform(5.4, 10)
            if inside(bx, zz, 2):
                _facet_rock(add, height, bx, zz, rng.uniform(.5, 1.4),
                            rng, "geology-wet-boulders", (WET_ROCK,) + ROCK_PALETTE)
        entries.append(dict(z=z, vertical_drop=round(top - bottom, 2)))
    return entries


def _slope_exposure(add, height, inside, rng):
    """Só expõe rocha onde o gradiente geológico justifica o afloramento."""
    totals = {"suave": 0, "moderado": 0, "acentuado": 0, "escarpa": 0}
    patches = 0
    for _ in range(1950):
        x, z = rng.uniform(-93, 93), rng.uniform(-90, 90)
        if not inside(x, z, 7):
            continue
        slope = slope_at(height, x, z)
        cls = slope_class(slope)
        totals[cls] += 1
        if cls == "suave":
            continue
        chance = {"moderado": .12, "acentuado": .36, "escarpa": .67}[cls]
        if rng.random() >= chance:
            continue
        rx = rng.uniform(1.7, 4.7) * (1.3 if cls == "escarpa" else 1)
        rz = rng.uniform(1.6, 5.2) * (1.3 if cls == "escarpa" else 1)
        _bedrock_skin(add, height, x, z, rx, rz, rng, "geology-exposed-bedrock")
        patches += 1
        if cls in ("acentuado", "escarpa") and rng.random() < .47:
            _facet_rock(add, height, x + rng.uniform(-1.4, 1.4),
                        z + rng.uniform(-1.4, 1.4),
                        rng.uniform(.8, 2.4), rng, "geology-talus")
    return totals, patches


def _bank_blocks(add, height, baseline, center_x, inside, rng):
    blocks, sediment = 0, 0
    for i in range(370):
        z = rng.uniform(-91, 91)
        side = rng.choice((-1, 1))
        x = center_x(z) + side * rng.uniform(6.3, 13.9)
        if not inside(x, z, 4):
            continue
        r = rng.uniform(.35, 1.5) if i % 3 else rng.uniform(1.5, 3.7)
        near_fall = min(abs(z - a) for a in (-59., -16., 38.)) < 8
        if near_fall:
            r *= 1.42
        # Parte das pedras penetra na água; sem blocos em grade.
        _facet_rock(add, height, x, z, r, rng,
                    "geology-river-boulders",
                    (WET_ROCK,) + ROCK_PALETTE,
                    waterline=baseline(center_x(z), z) - .35 if abs(x - center_x(z)) < 8 else None)
        blocks += 1
        if i % 9 == 0 and not near_fall:
            _bedrock_skin(add, height, x + side * 3, z + rng.uniform(-2, 2),
                          rng.uniform(1.7, 3.2), rng.uniform(1, 2.7), rng,
                          "geology-sediment-shelves")
            sediment += 1
    return blocks, sediment


def build_geology(*, add, height, baseline, river_center, inside, seed=5107):
    """Instala geologia como grupos GLB separados e editáveis.

    As mesmas funções são reaproveitáveis nos próximos biomas com novas regras.
    Não modifica o terreno global, os campos de Auralis nem os sistemas de jogo.
    """
    rng = random.Random(seed + 1729)
    shore_sections = _river_edges(add, height, river_center, inside, rng)
    falls = _falls_bedrock(add, height, baseline, river_center, inside, rng)
    samples, exposures = _slope_exposure(add, height, inside, rng)
    blocks, sediments = _bank_blocks(add, height, baseline, river_center, inside, rng)
    return {
        "shore_segments": shore_sections,
        "waterfalls_with_bedrock": falls,
        "slope_class_samples": samples,
        "slope_exposures": exposures,
        "riverbank_boulders": blocks,
        "sediment_shelves": sediments,
        "water_surface_animation": "shader-only; fixed water geometry",
        "vegetation_rule": "slope+river+points-of-interest; deterministic seed",
    }
