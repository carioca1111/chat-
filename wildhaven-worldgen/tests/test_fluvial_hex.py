"""Testes do micro-habitat e das geometrias do hex observável H_5_7."""
import math
import unittest

from hex_fluvial_details import (
    environment_at, habitat_probability, build_fluvial_details,
)


class HexEcologyTests(unittest.TestCase):
    def test_riverside_is_wetter_than_distant_hill(self):
        h = lambda x,z: 15 + .1*x + .1*z
        river = lambda z: 0.
        wet = environment_at(h,river,6,1)
        dry = environment_at(h,river,45,1)
        self.assertGreater(wet["soil_moisture"], dry["soil_moisture"])
        self.assertGreater(wet["fertility"], dry["fertility"])
        self.assertGreater(habitat_probability("broadleaf", wet),
                           habitat_probability("broadleaf", dry))

    def test_steep_slope_excludes_large_trees(self):
        h = lambda x,z: 13 + 2*x
        for kind in ("pine","broadleaf"):
            self.assertEqual(habitat_probability(kind,
                             environment_at(h,lambda z: 0,10,0)), 0.)

    def test_fluvial_details_are_real_triangles(self):
        groups = {}
        def add(name, vertices, triangles, colors):
            self.assertTrue(vertices and triangles)
            self.assertTrue(all(len(v)==3 and all(math.isfinite(a) for a in v)
                                for v in vertices))
            self.assertTrue(all(len(f)==3 and min(f)>=0 and max(f)<len(vertices)
                                for f in triangles))
            groups.setdefault(name, 0)
            groups[name] += len(triangles)
        def height(x,z):
            return (17+.06*(90-z)+5*math.tanh((x-36)/1.6)
                    +.6*math.sin(z*.16))
        result = build_fluvial_details(
            add=add,height=height,baseline=height,
            river_center=lambda z: 0.,
            inside=lambda x,z,margin=0: abs(x)<95-margin and abs(z)<95-margin,
            seed=5107)
        self.assertGreater(result["riparian_terrace_segments"],200)
        self.assertGreater(result["stratified_escarpments"],0)
        self.assertGreater(result["embedded_bank_stones"],30)
        self.assertGreater(groups["geology-stratal-escarpments"],0)
        self.assertGreater(groups["geology-cliff-fractures"],0)
        self.assertGreater(groups["geology-riparian-terrace-east"],0)
        self.assertGreater(groups["geology-riparian-terrace-west"],0)


if __name__ == "__main__":
    unittest.main()
