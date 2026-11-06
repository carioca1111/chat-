"""Small adversarial drainage/hex tests; full exports have separate acceptance QA."""
import unittest
import numpy as np

from worldgen.hydrology import breach_outlet, run_hydrology
from worldgen.regions import build_regions, hex_center, region_at
from worldgen.validate import _local_spill_surface


class DrainageTests(unittest.TestCase):
    def setUp(self):
        y, x = np.mgrid[-1:1:64j, -1:1:80j]
        self.height = ((.73 - x*x - y*y) * 1700
                       + 80 * np.sin(x*13) * np.cos(y*10)).astype(np.float32)
        self.land = self.height > 0
        self.rain = np.full_like(self.height, 1200)

    def generate(self):
        return run_hydrology(self.height, self.rain, self.land, 5000, 5000, 300)

    def test_drainage_is_connected_acyclic_downhill_and_conserves_runoff(self):
        fields, network = self.generate()
        rec = fields["flow_receiver"].ravel()
        ids = np.flatnonzero(self.land.ravel())
        rank = fields["flow_rank"].ravel()
        surface = fields["water_surface_m"].ravel()
        self.assertTrue(np.all(rec[ids] >= 0))
        self.assertTrue(np.all(rank[rec[ids]] < rank[ids]))
        self.assertTrue(np.all(surface[rec[ids]] <= surface[ids]))
        expected = (self.rain[self.land].astype(float) * .001 * 25e6 * .36 / (365.25*86400)).sum()
        actual = fields["discharge_m3s"][~self.land].astype(float).sum()
        self.assertAlmostEqual(actual / expected, 1, places=6)
        by_id = {r["id"]: r for r in network["rivers"]}
        self.assertTrue(by_id)
        for river in by_id.values():
            cells = river["cell_indices"]
            self.assertTrue(np.array_equal(rec[cells[:-1]], cells[1:]))
            if river["downstream_id"]:
                self.assertEqual(cells[-1], by_id[river["downstream_id"]]["cell_indices"][0])
            else:
                self.assertFalse(self.land.ravel()[cells[-1]])

    def test_seedless_hydrology_is_exactly_deterministic(self):
        first, n1 = self.generate()
        second, n2 = self.generate()
        for key in first:
            self.assertTrue(np.array_equal(first[key], second[key]), key)
        self.assertEqual(n1, n2)

    def test_lake_bed_is_preserved_and_sediment_budget_balances(self):
        # A deliberately resolved closed bowl in an ocean-surrounded plateau.
        y, x = np.mgrid[-1:1:96j, -1:1:96j]
        height = (1 - x*x - y*y) * 900
        height -= 600 * np.exp(-((x/.13)**2 + (y/.13)**2))
        height -= 200
        land = height > 0
        fields, network = run_hydrology(height, np.full_like(height, 1600), land, 3000, 3000, 100)
        self.assertGreater(len(network["lakes"]), 0)
        wet = fields["lake_id"] > 0
        self.assertGreater(float((fields["water_surface_m"] - fields["elevation_m"])[wet].max()), 100)
        budget = network["sediment_budget_m3"]
        self.assertLess(abs(budget["eroded"] - budget["deposited"] - budget["exported_to_ocean"]),
                        max(1, budget["eroded"] * 1e-6))

    def test_invalid_values_and_land_domain_edges_are_rejected(self):
        broken = self.height.copy()
        broken[20, 20] = np.nan
        with self.assertRaises(ValueError):
            run_hydrology(broken, self.rain, self.land, 5000, 5000)
        land = self.land.copy()
        land[0, 0] = True
        with self.assertRaises(ValueError):
            run_hydrology(self.height, self.rain, land, 5000, 5000)

    def test_physical_breach_drains_closed_bowl_to_lower_connected_water(self):
        y, x = np.mgrid[-1:1:96j, -1:1:96j]
        original = ((.9 - x*x - y*y) * 1200
                    - 700 * np.exp(-((x/.14)**2 + (y/.14)**2))).astype(np.float32)
        land = original > 0
        source = int(np.argmin(np.where((abs(x) < .08) & (abs(y) < .08), original, np.inf)))
        modified, metadata = breach_outlet(original, None, land, 3000, 3000, source_cell=source)
        self.assertTrue(np.all(modified <= original))
        self.assertGreater(metadata["maximum_excavation_m"], 300)
        self.assertLessEqual(metadata["receiving_natural_water_surface_m"],
                             metadata["source_pre_breach_elevation_m"] - 20)
        fields, _ = run_hydrology(modified, np.full_like(modified, 1200), land, 3000, 3000, 300)
        self.assertLess(float(fields["lake_depth_m"].ravel()[source]), 30)
        repeat, repeated_metadata = breach_outlet(original, None, land, 3000, 3000, source_cell=source)
        self.assertTrue(np.array_equal(modified, repeat))
        self.assertEqual(metadata, repeated_metadata)


class HexTests(unittest.TestCase):
    def test_axial_centers_and_shared_edge_sides(self):
        radius = 1000.
        for q in range(-4, 5):
            for r in range(-4, 5):
                self.assertEqual(region_at(*hex_center(q, r, radius), radius), (q, r))
        a = np.asarray(hex_center(0, 0, radius))
        b = np.asarray(hex_center(1, 0, radius))
        midpoint = (a + b) / 2
        direction = (b - a) / np.linalg.norm(b - a)
        self.assertEqual(region_at(*(midpoint - direction * .01), radius), (0, 0))
        self.assertEqual(region_at(*(midpoint + direction * .01), radius), (1, 0))

    def test_global_fields_are_not_modified_and_clipped_hexes_cover_rectangle(self):
        config = {"width_m": 12000, "height_m": 9000, "hex_radius_m": 1300}
        height = np.arange(80*96, dtype=np.float32).reshape(80, 96) / 10
        fields = {"elevation_m": height, "temperature_c": np.full_like(height, 12),
                  "precipitation_mm": np.full_like(height, 900), "soil_moisture": np.full_like(height, .5),
                  "biomes": np.ones_like(height, dtype=np.uint8), "land_mask": np.ones_like(height, dtype=bool)}
        copies = {key: value.copy() for key, value in fields.items()}
        metadata, ownership = build_regions(fields, config)
        for key, before in copies.items():
            self.assertTrue(np.array_equal(fields[key], before), key)
        regions = metadata["regions"]
        self.assertEqual(sum(r["sample_count"] for r in regions), height.size)
        self.assertEqual(ownership.shape, height.shape)
        self.assertAlmostEqual(sum(r["area_km2"] for r in regions), 108., places=8)
        by_id = {r["id"]: r for r in regions}
        for region in regions:
            for neighbor in region["neighbors"]:
                self.assertIn(region["id"], by_id[neighbor]["neighbors"])


class IndependentInsetValidationTests(unittest.TestCase):
    def test_local_spill_checker_distinguishes_closed_and_open_ravine(self):
        # A low center surrounded by an elevated rim must not be accepted as
        # a dry ravine merely because a separate coarse raster claims drainage.
        closed = np.full((32, 32), 500., dtype=np.float32)
        closed[8:24, 12:20] = 100.
        closed_spill = _local_spill_surface(closed)
        self.assertEqual(float(closed_spill[16, 16] - closed[16, 16]), 400.)
        opened = closed.copy()
        opened[16, 16:] = np.linspace(100., 20., 16)
        open_spill = _local_spill_surface(opened)
        self.assertEqual(float(open_spill[16, 16] - opened[16, 16]), 0.)
        self.assertTrue(np.isfinite(open_spill).all())


if __name__ == "__main__":
    unittest.main()
