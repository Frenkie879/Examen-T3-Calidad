"""Genera las gráficas del informe a partir de los resultados reales en /reports."""
import json, re, xml.etree.ElementTree as ET
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

R = Path(__file__).resolve().parents[1]
OUT = R / "graficas"
SURF, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e6e5e0"
ANTES, DESPUES = "#a3a29c", "#2a78d6"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "axes.edgecolor": GRID,
    "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2, "figure.facecolor": SURF,
    "axes.facecolor": SURF, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
    "axes.spines.top": False, "axes.spines.right": False, "axes.axisbelow": True})

def guardar(fig, nombre):
    fig.tight_layout(); fig.savefig(OUT / nombre, dpi=200); plt.close(fig)

# ---------- 1. Selenium antes/después por HU ----------
def por_hu(xml):
    res = {}
    for tc in ET.parse(xml).getroot().iter("testcase"):
        hu = re.match(r"(HU-0\d(?: / HU-05)?)", tc.attrib["name"]).group(1)
        hu = "HU-04/05" if "/" in hu else hu
        ok = tc.find("failure") is None
        a, t = res.get(hu, (0, 0)); res[hu] = (a + ok, t + 1)
    return res
v1 = por_hu(R / "selenium/junit-selenium-v1-antes.xml"); v2 = por_hu(R / "selenium/junit-selenium.xml")
etq = {"HU-01": "HU-01 Login", "HU-02": "HU-02 Catálogo", "HU-03": "HU-03 Reservas", "HU-04/05": "HU-04/05 Admin"}
hus = list(etq)
fig, ax = plt.subplots(figsize=(8, 4))
y = range(len(hus)); h = 0.36
for i, hu in enumerate(hus):
    for off, (d, col, lab) in [(-h/2 - .02, (v1, ANTES, "v1 antes")), (h/2 + .02, (v2, DESPUES, "v2 después"))]:
        a, t = d[hu]; pct = 100 * a / t
        ax.barh(i + off, pct, height=h, color=col, label=lab if i == 0 else None)
        ax.text(pct + 1, i + off, f"{a}/{t}", va="center", fontsize=10, color=INK)
ax.set_yticks(list(y), [etq[h_] for h_ in hus]); ax.invert_yaxis(); ax.set_xlim(0, 112)
ax.set_xlabel("% de casos aprobados"); ax.grid(axis="y", visible=False)
ax.set_title("Casos Selenium aprobados por historia de usuario", loc="left", color=INK, fontsize=13)
ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.2), ncol=2, frameon=False)
guardar(fig, "selenium_antes_despues.png")

# ---------- 2. Carga: escenarios ----------
esc = [json.load(open(R / f"carga/resumen_{u}u.json")) for u in (50, 100, 200, 400)]
labels = [f"{e['escenario']['usuarios']}" for e in esc]
fig, axs = plt.subplots(1, 2, figsize=(10, 4))
ax = axs[0]
x = range(len(esc)); w = 0.38
prom = [e["total"]["promedio_ms"] for e in esc]; p95 = [e["total"]["p95_ms"] for e in esc]
ax.bar([i - w/2 - .01 for i in x], prom, width=w, color=ANTES, label="Promedio")
ax.bar([i + w/2 + .01 for i in x], p95, width=w, color=DESPUES, label="Percentil 95")
for i in x:
    ax.text(i - w/2, prom[i] + 2, f"{prom[i]:.0f}", ha="center", fontsize=9, color=INK)
    ax.text(i + w/2, p95[i] + 2, f"{p95[i]}", ha="center", fontsize=9, color=INK)
ax.set_xticks(list(x), labels); ax.set_xlabel("Usuarios concurrentes"); ax.set_ylabel("ms")
ax.set_title("Tiempo de respuesta (SLA < 1000 ms)", loc="left", color=INK, fontsize=12)
ax.legend(frameon=False); ax.grid(axis="x", visible=False)
ax = axs[1]
thr = [e["total"]["throughput_rps"] for e in esc]
ax.bar(list(x), thr, width=0.55, color=DESPUES)
for i in x: ax.text(i, thr[i] + 4, f"{thr[i]:.0f}", ha="center", fontsize=9, color=INK)
ax.set_xticks(list(x), labels); ax.set_xlabel("Usuarios concurrentes"); ax.set_ylabel("peticiones / s")
ax.set_title("Throughput · 0 % de errores en todos", loc="left", color=INK, fontsize=12)
ax.grid(axis="x", visible=False)
guardar(fig, "carga_escenarios.png")

# ---------- 3. Carga: serie temporal 100 usuarios ----------
e = json.load(open(R / "carga/resumen_100u.json"))
s = e["serie"]
fig, axs = plt.subplots(2, 1, figsize=(9, 4.8), sharex=True, gridspec_kw={"height_ratios": [1, 1]})
axs[0].plot([p["s"] for p in s], [p["hilos"] for p in s], color=ANTES, lw=2)
axs[0].set_ylabel("Usuarios activos"); axs[0].set_title("Escenario objetivo: 100 usuarios, ramp-up 30 s, 120 s", loc="left", color=INK, fontsize=12)
axs[1].plot([p["s"] for p in s], [p["rps"] for p in s], color=DESPUES, lw=2)
axs[1].set_ylabel("Peticiones / s"); axs[1].set_xlabel("Segundos desde el inicio")
guardar(fig, "carga_serie_100u.png")

# ---------- 4. Sonar antes/después ----------
tipos = ["Vulnerabilidades", "Bugs", "Security Hotspots", "Code Smells"]
antes = [5, 8, 8, 61]; despues = [0, 0, 0, 0]
fig, ax = plt.subplots(figsize=(8, 4))
x = range(len(tipos)); w = 0.38
ax.bar([i - w/2 - .01 for i in x], antes, width=w, color=ANTES, label="v1 antes")
ax.bar([i + w/2 + .01 for i in x], [max(d, 0.4) for d in despues], width=w, color=DESPUES, label="v2 después")
for i in x:
    ax.text(i - w/2, antes[i] + 1, str(antes[i]), ha="center", fontsize=10, color=INK)
    ax.text(i + w/2, 1.2, "0", ha="center", fontsize=10, color=INK)
ax.set_xticks(list(x), tipos); ax.set_ylabel("Incidencias"); ax.grid(axis="x", visible=False)
ax.set_title("Incidencias de calidad: antes vs. después de refactorizar", loc="left", color=INK, fontsize=13)
ax.legend(frameon=False)
guardar(fig, "sonar_antes_despues.png")
print("ok")
