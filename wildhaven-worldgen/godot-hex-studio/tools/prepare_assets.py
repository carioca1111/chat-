"""Sincroniza o Godot Studio com o atlas do Codex e o GLB da branch.

Executar após clonar a branch wildhaven-hex-workshop ou wildhaven-godot-studio.
Não altera o jogo, o gerador ou os dados autoritativos de Auralis.
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
WORLDGEN = HERE.parent


def prepare(verbose: bool = True) -> dict[str, str]:
    data_dir = HERE / 'data'
    assets_dir = HERE / 'assets'
    data_dir.mkdir(parents=True, exist_ok=True)
    assets_dir.mkdir(parents=True, exist_ok=True)
    source_dest = {
        WORLDGEN / 'outputs' / 'regions.json': data_dir / 'regions.json',
        WORLDGEN / 'outputs' / 'world.json': data_dir / 'world.json',
        WORLDGEN / 'outputs' / 'biomes.png': data_dir / 'biomes.png',
    }
    copied: dict[str, str] = {}
    for source, dest in source_dest.items():
        if source.is_file():
            shutil.copyfile(source, dest)
            copied[dest.name] = 'copiado'
            if verbose:
                print('OK:', dest)
        else:
            copied[dest.name] = 'ausente, usando atlas compacto'
            if verbose:
                print('Aviso:', source, 'não existe')

    glb_source = WORLDGEN / 'hex-scenes' / 'H_5_7' / 'forest-temperate.glb'
    br_source = WORLDGEN / 'hex-scenes' / 'H_5_7' / 'forest-temperate.glb.br'
    glb_dest = assets_dir / 'H_5_7_forest.glb'
    if glb_source.is_file():
        shutil.copyfile(glb_source, glb_dest)
        copied['forest.glb'] = 'copiado'
    elif br_source.is_file():
        try:
            import brotli
        except ImportError as exc:
            raise SystemExit('Instale o descompressor: python -m pip install brotli') from exc
        glb_dest.write_bytes(brotli.decompress(br_source.read_bytes()))
        copied['forest.glb'] = 'descompactado da branch'
    elif glb_dest.is_file():
        copied['forest.glb'] = 'modelo já presente no pacote'
    else:
        copied['forest.glb'] = 'indisponível — prévia procedural será usada'

    if glb_dest.is_file():
        with glb_dest.open('rb') as f:
            assert f.read(4) == b'glTF', 'GLB inválido: magic glTF ausente'
        if verbose:
            print('Modelo H_5_7 disponível:', glb_dest.stat().st_size, 'bytes')
    if (data_dir / 'regions.json').is_file():
        regions = json.loads((data_dir / 'regions.json').read_text(encoding='utf-8'))['regions']
        assert len(regions) == 368, f'Esperadas 368 regiões, obtidas {len(regions)}'
        copied['world_regions'] = str(len(regions))
        if verbose:
            print('Atlas oficial do Codex:', len(regions), 'regiões')
    return copied


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Importar dados existentes do Wildhaven para Godot')
    ap.add_argument('--quiet', action='store_true')
    args = ap.parse_args()
    prepare(verbose=not args.quiet)