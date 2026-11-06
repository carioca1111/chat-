"""Physical regression tests for iterative geomorphic landscape ageing."""
import unittest
import numpy as np

from worldgen.erosion import evolve_landscape
from worldgen.hydrology import _route


class LandscapeEvolutionTests(unittest.TestCase):
    def setUp(self):
        y, x = np.mgrid[-1:1:64j, -1:1:80j]
        self.height = ((.82 - x*x - y*y) * 2600
                       + 240 * np.sin(x*17) * np.cos(y*13)).astype(np.float32)
        self.land = self.height > 0
        self.rain = np.full_like(self.height, 1600)
        self.settings = {"erosion": {"iterations": 6, "reroute_every": 2,
                                     "model_years": 50000, "stream_power_k": 1e-5}}

    def run_model(self, **kwargs):
        return evolve_landscape(self.height, self.land, 1500, 1500, self.settings,
                                precipitation_mm=self.rain, **kwargs)

    def test_evolution_carves_drainage_preserves_ocean_and_accounts_for_material(self):
        height, fields, metadata = self.run_model()
        self.assertGreater(float(fields["geomorphic_fluvial_incision_m"][self.land].max()), 100)
        self.assertGreater(float(fields["geomorphic_hillslope_transport_m"].sum()), 0)
        self.assertGreater(float(fields["geomorphic_deposition_m"].sum()), 0)
        self.assertTrue(np.array_equal(height[~self.land], self.height[~self.land]))
        self.assertTrue(np.isfinite(height).all())
        self.assertGreater(float(height[self.land].min()), 0)
        self.assertLess(float(height[self.land].sum()), float(self.height[self.land].sum()))
        budget = metadata["material_budget_m3"]
        self.assertLess(abs(budget["transport_residual"]), budget["eroded"] * 1e-10)
        self.assertLess(abs(budget["float32_height_residual"]), budget["eroded"] * 1e-5)
        surface, receiver, order = _route(height, self.land, 1500, 1500)
        indices = np.flatnonzero(self.land.ravel())
        self.assertTrue((surface.ravel()[receiver.ravel()[indices]] <= surface.ravel()[indices]).all())
        self.assertEqual(metadata["routing_passes"], 3)

    def test_deterministic_and_exactly_protected_landmark(self):
        protection = np.zeros(self.height.shape)
        protection[26:34, 35:43] = 1
        first, f1, m1 = self.run_model(protection=protection)
        second, f2, m2 = self.run_model(protection=protection)
        self.assertTrue(np.array_equal(first, second))
        self.assertEqual(m1, m2)
        for key in f1:
            self.assertTrue(np.array_equal(f1[key], f2[key]), key)
        self.assertTrue(np.array_equal(first[protection == 1], self.height[protection == 1]))

    def test_wetter_catchments_erode_more_and_repeated_stages_are_effective(self):
        # An exposure model must actually react to precipitation and iteration,
        # rather than exporting a fabricated erosion field beside unchanged DEM.
        dry, dry_fields, _ = evolve_landscape(self.height, self.land, 1500, 1500,
                                             self.settings, precipitation_mm=self.rain * .1)
        wet, wet_fields, _ = self.run_model()
        self.assertGreater(float(wet_fields["geomorphic_fluvial_incision_m"].sum()),
                           float(dry_fields["geomorphic_fluvial_incision_m"].sum()))
        self.assertFalse(np.array_equal(dry, wet))

    def test_invalid_configuration_is_rejected(self):
        broken = self.height.copy()
        broken[30, 30] = np.nan
        with self.assertRaises(ValueError):
            evolve_landscape(broken, self.land, 1500, 1500, self.settings)
        with self.assertRaises(ValueError):
            evolve_landscape(self.height, self.land, 0, 1500, self.settings)
        with self.assertRaises(ValueError):
            self.run_model(protection=np.ones((3, 3)))

    def test_positive_mountain_tile_keeps_parent_edges_and_erodes_real_valleys(self):
        y, x = np.mgrid[-1:1:80j, -1:1:96j]
        original = (900 + 2300*np.exp(-2*(x*x+y*y))
                    + 260*np.sin(x*13)*np.cos(y*11)).astype(np.float32)
        land = np.ones_like(original, dtype=bool)
        settings = {"erosion": {"boundary_mode": "fixed_open", "iterations": 8,
                                 "model_years": 80000, "stream_power_k": 2e-5}}
        aged, fields, metadata = evolve_landscape(original, land, 250, 250, settings)
        edge = np.zeros_like(land)
        edge[0] = edge[-1] = True
        edge[:, 0] = edge[:, -1] = True
        self.assertTrue(np.array_equal(original[edge], aged[edge]))
        self.assertGreater(float(fields["geomorphic_fluvial_incision_m"].max()), 300)
        self.assertGreater(float(metadata["material_budget_m3"]["fluvial_export_to_tile_boundary"]), 0)
        self.assertEqual(metadata["material_budget_m3"]["fluvial_export_to_ocean"], 0)
        self.assertTrue(np.isfinite(aged).all())
        self.assertGreater(float(aged.min()), 0)


if __name__ == "__main__":
    unittest.main()
