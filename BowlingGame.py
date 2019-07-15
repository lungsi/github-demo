class Game(object):

    def __init__(self):
        self.points_scored = 0

    def roll(self,pins):
        self.points_scored += pins

    def score(self):
        return self.points_scored
