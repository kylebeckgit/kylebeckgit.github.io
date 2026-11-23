#!/usr/bin/env python3
"""Free-edge circular plate (Kirchhoff) mode ratios, nu=0.33, computed numerically.
Free edge: M_r=0 and V_r=0 at r=1 (see Leissa, Vibration of Plates). Used for the saw blade entry."""
import numpy as np
from scipy.special import jv, iv, jvp, ivp
from scipy.optimize import brentq
nu = 0.33
def det(lam, n):
    def rows(fn, dfn, sign, k):
        f  = fn(n, k)
        f1 = dfn(n, k, 1)*k
        f2 = dfn(n, k, 2)*k**2
        f3 = dfn(n, k, 3)*k**3
        M = f2 + nu*(f1 - n*n*f)
        V = f3 + f2 - f1 - (2-nu)*n*n*f1 + (3-nu)*n*n*f
        return M, V
    # J part: kr = lam ; I part: kr = lam (d/dr of I(lam r) -> lam^m I^(m))
    Mj, Vj = rows(jv, jvp, 1, lam)
    Mi, Vi = rows(iv, ivp, 1, lam)
    return Mj*Vi - Mi*Vj
out = []
for n in range(0, 8):
    xs = np.linspace(0.5 if n else 1.0, 14, 5000)
    vals = [det(x, n) for x in xs]
    for a, b, va, vb in zip(xs, xs[1:], vals, vals[1:]):
        if va*vb < 0:
            r = brentq(det, a, b, args=(n,))
            if n == 0 and r < 1: continue
            if n == 1 and r < 1: continue
            out.append((r*r, n))
out.sort()
# Remove spurious zero-frequency/rigid roots; take modes above the (2,0) fundamental
out = [o for o in out if o[0] > 1.0]
base = out[0][0]
for lam2, n in out[:14]:
    print(f"n={n} lam2={lam2:.3f} ratio={lam2/base:.4f}")
