import unittest

from BowlingGame import Game

class BowlingGameTest(unittest.TestCase):

    def setUp(self):
        self.g = Game()

    def testGutterGame(self):
        n = 20
        pins = 0
        self.rollMany(n, pins)
        self.assertEqual(0, self.g.score())

    def rollMany(self, n, pins):
        for i in range(n):
            self.g.roll(pins)

    def testAllOnes(self):
        for i in range(20):
            self.g.roll(1)
        self.assertEqual(20, self.g.score())

if __name__ == '__main__':
    unittest.main()
