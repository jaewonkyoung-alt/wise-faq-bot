import os, sys
from lib import Deck
import w4final
d = Deck()
w4final.build(d)
out = sys.argv[1] if len(sys.argv) > 1 else "2021212843_경재원_4주차_진행보고.pptx"
d.save(out)
print("saved", out, "slides", len(d.prs.slides))
