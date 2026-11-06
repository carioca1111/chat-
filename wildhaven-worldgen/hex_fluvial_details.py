"""Geometria hidrogeológica e micro-habitats reutilizáveis de Wildhaven.

Malhas físicas editáveis. Não toca em raster, erosão continental ou gameplay.
As coordenadas são cênicas (X leste, Y altitude, Z sul); não são distâncias
geológicas calibradas. Os grupos ficam separados no glTF para futuras LODs.
"""
from __future__ import annotations

import math
import random

STONE = ((153, 151, 134, 255), (174, 161, 137, 255),
         (132, 137, 125, 255), (183, 169, 143, 255))
WET = (101, 124, 122, 255)
SILT = (185, 161, 113, 255)
EARTH = (130, 125, 93, 255)


def clamp(value, lower=0., upper=1.):
    return max(lower, min(upper, value))


def environment_at(height, river_center, x, z):
    """Proxy cênico determinístico de solo/umidade/temperatura local.

    O macrobioma/temperatura vem de Auralis; estas variações são microclimas
    do H_5_7, NÃO uma alteração nos campos continentais do Codex.
    """
    y = height(x, z)
    step = 1.6
    dx = (height(x + step, z) - height(x - step, z)) / (2 * step)
    dz = (height(x, z + step) - height(x, z - step)) / (2 * step)
    slope = math.hypot(dx, dz)
    river_distance = abs(x - river_center(z))
    wetness = clamp(1 - river_distance / 30)
    soil_moisture = clamp(.48 + .42 * wetness - .006 * max(0, y - 12)
                          - .07 * slope + .045 * math.sin(x * .13 + z * .07))
    fertility = clamp(.57 + .23 * wetness - .19 * min(slope, 2)
                       + .035 * math.cos(x * .12 - z * .09))
    temperature_c = 24.6 - .047 * (y - 12) + .22 * math.sin(z * .025)
    return dict(altitude=y, slope=slope, river_distance=river_distance,
                soil_moisture=soil_moisture, fertility=fertility,
                temperature_c=temperature_c)


def habitat_probability(kind, env):
    """Probabilidades contínuas para evitar vegetação em malha regular."""
    m, f, s = env["soil_moisture"], env["fertility"], env["slope"]
    if kind == "pine":
        if s > 1.2: return 0.
        return clamp(.25 + .25 * (env["altitude"] > 17)
                     + .27 * (1 - m) + .17 * f - .12 * s, .05, .95)
    if kind == "broadleaf":
        if s > .98: return 0.
        return clamp(.15 + .52 * m + .18 * f - .3 * s, .05, .95)
    if kind == "shrub":
        if s > 1.6: return 0.
        return clamp(.2 + .36 * m + .2 * f - .16 * s, .05, .95)
    if kind == "flower":
        if s > .72: return 0.
        return clamp(.18 + .38 * f + .12 * m - .25 * s, .05, .92)
    raise ValueError("Unknown habitat: " + kind)


def _angular_block(add, height, inside, x, z, radius, rng, group,
                   wet=False):
    """Prisma angular volumétrico afundado no terreno; nenhuma textura."""
    if not inside(x, z, radius * 1.3 + .6):
        return False
    n = rng.choice((7, 8, 9))
    phase = rng.random() * math.tau
    ground = height(x, z)
    vertices, faces, colors = [], [], []
    body_color = WET if wet else rng.choice(STONE)
    for layer in range(3):
        for j in range(n):
            a = phase + math.tau * j / n
            rr = radius * (.94 if layer == 0 else (.86 if layer == 1 else .51))
            rr *= rng.uniform(.8, 1.11)
            px, pz = x + rr * math.cos(a), z + rr * math.sin(a)
            local = height(px, pz)
            py = (min(ground, local) - .52 * radius if layer == 0
                  else ground + radius * (.33 if layer == 1 else .83)
                  + rng.uniform(-.13, .16) * radius)
            vertices.append([px, py, pz])
            shift = rng.uniform(-11, 10) - (9 if layer == 0 else 0)
            colors.append(tuple(int(clamp(c + shift, 0, 255))
                                for c in body_color[:3]) + (255,))
    vertices.append([x, ground + radius * 1.04, z])
    colors.append(body_color)
    for j in range(n):
        k = (j + 1) % n
        for layer in (0, 1):
            a, b, c, d = layer * n + j, layer * n + k, (layer+1)*n+k, (layer+1)*n+j
            faces.extend(((a, b, c), (a, c, d)))
        faces.append((2*n+j, 2*n+k, 3*n))
    add(group, vertices, faces, colors)
    return True


def _bank_terraces(add, height, river_center, inside, rng):
    """Múltiplas faixas de sedimento e pedra, com bordas geométricas.

    A primeira faixa começa no leito próximo à linha d'água; as demais
    assentam na encosta. A curvatura é herdada do eixo fluvial contínuo.
    """
    sections = 0
    for side in (-1, 1):
        vertices, faces, colors = [], [], []
        previous = None
        for i in range(225):
            z = -93 + i * .83
            cx = river_center(z)
            wav = .20 * math.sin(z * .19) + .11 * math.sin(z * .43 + side)
            offsets = (5.75, 6.45, 7.4, 8.65, 10.3, 12.1)
            row = []
            for band, dist in enumerate(offsets):
                px = cx + side * (dist + wav * (band / 5))
                if not inside(px, z, 1.8):
                    row = []
                    break
                y = height(px, z) + (.07, .17, .24, .19, .13, .06)[band]
                y += .045 * math.sin(z * .54 + band * 2.3)
                row.append([px, y, z])
            if not row:
                previous = None
                continue
            start = len(vertices)
            vertices.extend(row)
            colors.extend((WET, WET, rng.choice(STONE), rng.choice(STONE),
                           SILT if i % 7 < 3 else EARTH, EARTH))
            if previous is not None:
                for j in range(5):
                    if side > 0:
                        faces.extend(((previous+j, start+j, start+j+1),
                                      (previous+j, start+j+1, previous+j+1)))
                    else:
                        faces.extend(((previous+j, start+j+1, start+j),
                                      (previous+j, previous+j+1, start+j+1)))
                sections += 1
            previous = start
        if faces:
            add("geology-riparian-terrace-west" if side < 0
                else "geology-riparian-terrace-east", vertices, faces, colors)
    return sections


def _cliff_faces(add, height, inside, river_center, rng):
    """Degraus estratificados SOMENTE em encostas realmente inclinadas.

    Cada afloramento contém uma face irregular, topo, fissuras 3D e tálus
    enterrado na base. A direção deriva do gradiente do próprio terreno.
    """
    centers = []
    faces_count = fissures = scree = 0
    for _ in range(3500):
        if len(centers) >= 35:
            break
        x, z = rng.uniform(-84, 84), rng.uniform(-79, 78)
        if not inside(x, z, 13) or abs(x - river_center(z)) < 14:
            continue
        if (x+63)**2+(z-29)**2 < 19**2 or (x-54)**2+(z+53)**2 < 13**2:
            continue
        d = 1.3
        gx = (height(x+d, z)-height(x-d, z))/(2*d)
        gz = (height(x, z+d)-height(x, z-d))/(2*d)
        gradient = math.hypot(gx, gz)
        if gradient < .76 or height(x,z) < 11:
            continue
        if any((x-ax)**2+(z-az)**2 < 8.5**2 for ax,az in centers):
            continue
        centers.append((x,z))
        ux, uz = gx / gradient, gz / gradient
        tx, tz = -uz, ux
        length = rng.uniform(4.8, 10.0)
        verts, tris, colors = [], [], []
        for j in range(8):
            step = (j/7-.5)*length
            cx,cz = x+tx*step,z+tz*step
            for k, along in enumerate((-1.55, -.11, 1.55)):
                bx,bz = cx+ux*along,cz+uz*along
                true_y = height(bx,bz)
                if k == 0: by=true_y-.36
                elif k == 1: by=true_y+rng.uniform(.25,.54)
                else: by=true_y+.16
                bx += ux * (.26 if k == 1 else 0)
                verts.append([bx, by, bz])
                base = rng.choice(STONE)
                diff = (-18 if k == 0 else (7 if k == 1 else 12))
                colors.append(tuple(int(clamp(c+diff+rng.randint(-5,5),0,255))
                                    for c in base[:3])+(255,))
            if j:
                a=3*(j-1); b=3*j
                tris.extend(((a,b,a+1),(a+1,b,b+1),
                             (a+1,b+1,a+2),(a+2,b+1,b+2)))
        add("geology-stratal-escarpments", verts, tris, colors)
        faces_count += 1
        # Two physically modeled dark wedge seams, not normal maps / decals.
        for k in (2,5):
            a = 3*k+1
            top=verts[a+1];mid=verts[a];low=verts[a-1]
            slit = .09
            crack = [[mid[0]+tx*slit, mid[1]+.025, mid[2]+tz*slit],
                     [top[0]+tx*slit, top[1]+.035, top[2]+tz*slit],
                     [low[0]+tx*slit+.08*ux, low[1]+.035, low[2]+tz*slit+.08*uz]]
            add("geology-cliff-fractures", crack, ((0,1,2),),
                [(65,70,65,255)]*3)
            fissures+=1
        for b in range(rng.randrange(2,5)):
            p = x-ux*rng.uniform(1.6,3.8)+tx*rng.uniform(-length/2,length/2)
            q = z-uz*rng.uniform(1.6,3.8)+tz*rng.uniform(-length/2,length/2)
            if _angular_block(add,height,inside,p,q,rng.uniform(.32,.95),rng,
                              "geology-escarpment-talus"):
                scree+=1
    return faces_count,fissures,scree


def _river_stones(add, height, baseline, river_center, inside, rng):
    """Clusters assimétricos e parcialmente submersos nas margens sinuosas."""
    blocks = 0
    clusters = 0
    for n in range(92):
        z = rng.uniform(-88, 88)
        side = -1 if rng.random() < .5 else 1
        center = river_center(z)
        # Nas quedas o leito exige grandes blocos de sustentação.
        near_drop = min(abs(z-v) for v in (-59, -16, 38)) < 10
        if rng.random() < .25 and not near_drop:
            continue
        clusters += 1
        for i in range(rng.randint(2,5)):
            bx = center + side * (rng.uniform(6.1,10.4) +
                                  rng.gauss(0, .3))
            bz = z+rng.gauss(0,1.8)
            radius = rng.uniform(.35,1.45) * (1.8 if near_drop and i==0 else 1)
            if _angular_block(add,height,inside,bx,bz,radius,rng,
                              "geology-clustered-bankstones",
                              wet=abs(bx-river_center(bz)) < 7.3):
                blocks+=1
    return clusters,blocks


def build_fluvial_details(*, add, height, baseline, river_center,
                          inside, seed=5107):
    rng=random.Random(seed+3011)
    banks=_bank_terraces(add,height,river_center,inside,rng)
    cliffs,cracks,talus=_cliff_faces(add,height,inside,river_center,rng)
    clusters,stones=_river_stones(add,height,baseline,river_center,inside,rng)
    return dict(riparian_terrace_segments=banks,
                stratified_escarpments=cliffs,
                cliff_fissures=cracks,
                escarpment_talus=talus,
                asymmetric_bank_clusters=clusters,
                embedded_bank_stones=stones,
                detail_rule="terrain_gradient+river_distance+erosion_proxy",
                model_type="real_triangle_meshes_no_texture_decals")
