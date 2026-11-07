"""Download the real photographs shown in the info panel from Wikimedia Commons.

Every image comes with machine-readable author and licence metadata, which is
written to src/data/photos.js (used by the UI) and CREDITS.md (attribution).
Only freely licensed files are accepted (public domain, CC0, CC BY, CC BY-SA).

Usage:  python tools/fetch-photos.py          (requires Pillow)
"""

import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from html import unescape
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "images" / "photos"
UA = {"User-Agent": "SolarSystemMotion/1.0 (https://github.com/GuillBla/Solar-System-Motion)"}
MAX_SIDE = 800       # px, longest side after resizing
QUALITY = 78         # WebP quality

# (object id, Commons file title, French caption, optional extras)
# extras: "credit" overrides the Commons Artist field when it is too verbose,
#         "pos" is a CSS object-position for the cropped thumbnail.
CATALOG = [
    ("sun", "The Sun by the Atmospheric Imaging Assembly of NASA's Solar Dynamics Observatory - 20100819.jpg",
     "Le Soleil en ultraviolet extrême, vu par Solar Dynamics Observatory (NASA), 2010", {}),
    ("sun", "Solar eclipse 1999 4 NR.jpg",
     "La couronne solaire, visible seulement pendant l'éclipse totale du 11 août 1999", {}),

    ("mercury", "Mercury in color - Prockter07-edit1.jpg",
     "Mercure en couleurs renforcées, sonde MESSENGER (NASA), 2008",
     {"credit": "NASA / Johns Hopkins University APL / Carnegie Institution of Washington"}),

    ("venus", "Venus-real color.jpg",
     "Vénus et son épaisse couche de nuages, sonde Mariner 10 (NASA), 1974", {}),
    ("venus", "Venus globe.jpg",
     "La surface de Vénus cartographiée au radar, à travers les nuages, par Magellan (NASA)", {}),
    ("venus", "Surface of Venus from Venera 13.jpg",
     "Le sol de Vénus photographié par l'atterrisseur soviétique Venera 13, 1982", {"pos": "center"}),

    ("earth", "The Earth seen from Apollo 17.jpg",
     "« La Bille bleue », photographiée par l'équipage d'Apollo 17, 1972",
     {"credit": "NASA / Apollo 17 crew"}),
    ("earth", "NASA-Apollo8-Dec24-Earthrise.jpg",
     "« Lever de Terre » au-dessus de la Lune, Apollo 8, 24 décembre 1968", {}),
    ("earth", "Pale Blue Dot.png",
     "« Point bleu pâle » : la Terre vue par Voyager 1 à 6 milliards de km, 1990", {"pos": "center 70%", "credit": "NASA/JPL (Voyager 1)"}),

    ("moon", "FullMoon2010.jpg", "La pleine Lune photographiée depuis la Terre, 2010", {}),
    ("moon", "Aldrin Apollo 11 original.jpg", "Buzz Aldrin sur la Lune, mission Apollo 11, juillet 1969", {"credit": "NASA / Neil Armstrong"}),

    ("mars", "OSIRIS Mars true color.jpg",
     "Mars en couleurs naturelles, vue par la sonde Rosetta (ESA) lors de son survol, 2007",
     {"credit": "ESA & MPS for OSIRIS Team MPS/UPD/LAM/IAA/RSSD/INTA/UPM/DASP/IDA"}),
    ("mars", "Curiosity Self-Portrait at 'Big Sky' Drilling Site.jpg",
     "Autoportrait du rover Curiosity (NASA) dans le cratère Gale, 2015", {"pos": "center 40%"}),

    ("jupiter", "Jupiter and its shrunken Great Red Spot.jpg",
     "Jupiter et sa Grande Tache rouge, télescope spatial Hubble, 2014", {}),
    ("jupiter", "PIA21972 Jupiter Blues.jpg",
     "L'hémisphère sud de Jupiter et ses tempêtes, vu par la sonde Juno (NASA), 2017", {}),
    ("jupiter", "Jupiter's Great Red Spot mosaic from Voyager 1.jpg",
     "La Grande Tache rouge photographiée par Voyager 1, 1979", {}),

    ("saturn", "Saturn during Equinox.jpg",
     "Saturne à l'équinoxe, mosaïque de la sonde Cassini (NASA/ESA), 2008", {}),
    ("saturn", "Saturn eclipse.jpg",
     "Saturne en contre-jour, cachant le Soleil, vue par Cassini, 2006", {}),

    ("uranus", "Uranus2.jpg", "Uranus photographiée par Voyager 2, 1986", {}),
    ("uranus", "Uranus - NASA-ESA JWST Webb Space Telescope (53412941760).png",
     "Uranus et ses anneaux en infrarouge, télescope spatial James Webb", {"credit": "NASA/ESA/CSA JWST, traitement Andrea Luck"}),

    ("neptune", "Neptune - Voyager 2 (29347980845) flatten crop.jpg",
     "Neptune et ses nuages, photographiée par Voyager 2, 1989", {}),

    ("pluto", "Pluto in True Color - High-Res.jpg",
     "Pluton et sa grande plaine glacée en forme de cœur, New Horizons (NASA), 2015",
     {"credit": "NASA / Johns Hopkins University APL / Southwest Research Institute"}),

    ("io", "Io highest resolution true color.jpg",
     "Io, la lune la plus volcanique du Système solaire, sonde Galileo (NASA)", {}),
    ("europa", "PIA19048 realistic color Europa mosaic.jpg",
     "Europe et sa croûte de glace fracturée, sonde Galileo (NASA)", {}),
    ("europa", "Europa - Perijove 45 (cropped).png",
     "Europe vue par Juno lors de son survol de 2022", {}),
    ("ganymede", "Ganymede - Perijove 34 Composite.jpg",
     "Ganymède, la plus grande lune du Système solaire, vue par Juno en 2021", {}),
    ("callisto", "Callisto.jpg", "Callisto, criblée de cratères, sonde Galileo (NASA)", {}),
    ("titan", "Titan in true color.jpg",
     "Titan et son atmosphère orangée, sonde Cassini (NASA/ESA)", {}),
    ("titan", "Huygens surface color sr.jpg",
     "Le sol de Titan photographié par l'atterrisseur Huygens (ESA), 14 janvier 2005", {"pos": "center 75%"}),
    ("triton", "Triton moon mosaic Voyager 2 (large).jpg",
     "Triton, mosaïque de Voyager 2 lors du survol de 1989", {}),
    ("charon", "Charon in Color (HQ).jpg", "Charon photographiée par New Horizons, 2015",
     {"credit": "NASA / Johns Hopkins University APL / Southwest Research Institute"}),

    ("halley", "Comet Halley close up.jpg",
     "Le noyau de la comète de Halley vu par la sonde Giotto (ESA), mars 1986", {}),
    ("halley", "Lspn comet halley.jpg",
     "La comète de Halley dans le ciel le 8 mars 1986", {}),

    ("encke", "Comet Encke.jpg", "La comète d'Encke au télescope", {}),
    ("encke", "Comet Encke from MESSENGER.png",
     "Encke photographiée par MESSENGER depuis l'orbite de Mercure, 2013",
     {"credit": "NASA / Johns Hopkins University APL / Carnegie Institution of Washington"}),

    ("cg67p", "Comet 67P on 19 September 2014 NavCam mosaic.jpg",
     "Le noyau de 67P, mosaïque de la sonde Rosetta (ESA), 19 septembre 2014", {"credit": "ESA/Rosetta/NAVCAM"}),
    ("cg67p", "Outburst in action - Flickr - europeanspaceagency.jpg",
     "Un sursaut de gaz et de poussières sur 67P, saisi par Rosetta (ESA) en 2015", {}),

    ("halebopp", "Comet Hale-Bopp 1995O1.jpg",
     "Hale-Bopp et ses deux queues, bleue (ions) et blanche (poussières), 1997",
     {"credit": "E. Kolmhofer, H. Raab; Johannes-Kepler-Observatory, Linz"}),
    ("halebopp", "Comet-Hale-Bopp-29-03-1997 hires adj.jpg",
     "Hale-Bopp au-dessus d'une forêt autrichienne, 29 mars 1997", {"pos": "center 30%"}),

    ("swifttuttle", "Perseid Meteor Shower (NHQ202108110001).jpg",
     "Une étoile filante des Perséides (2021) : ce sont des poussières laissées par Swift-Tuttle", {"credit": "NASA/Bill Ingalls"}),
    ("swifttuttle", "A466 1992-11-25 109PSwift-Tuttle.jpg",
     "Swift-Tuttle lors de son dernier passage, 25 novembre 1992 (observatoire de Heidelberg)", {}),

    ("voyager1", "Voyager spacecraft.jpg", "Une sonde Voyager, avec sa grande antenne de 3,7 m (NASA/JPL)", {}),
    ("voyager1", "Voyager 1 Launch.jpg",
     "Lancement de Voyager 1 par une fusée Titan IIIE-Centaur, 5 septembre 1977", {"pos": "center 30%", "credit": "NASA"}),
    ("voyager1", "Family portrait (Voyager 1).png",
     "Le « portrait de famille » du Système solaire pris par Voyager 1 en 1990", {}),

    ("voyager2", "Titan 3E Centaur launches Voyager 2.jpg",
     "Lancement de Voyager 2, 20 août 1977", {"pos": "center 30%"}),
    ("voyager2", "The Sounds of Earth Record Cover - GPN-2000-001978.jpg",
     "Le disque d'or, message de la Terre embarqué sur les deux Voyager", {}),
    ("voyager2", "Neptune Full.jpg", "Neptune photographiée par Voyager 2, août 1989", {}),

    ("pioneer10", "Testing Pioneer F Spacecraft - GPN-2000-001626.jpg",
     "Pioneer 10 en essais avant son lancement (NASA)", {"pos": "center 40%"}),
    ("pioneer10", "Pioneer10-plaque.jpg",
     "La plaque de Pioneer, message destiné à d'éventuels extraterrestres",
     {"credit": "Carl Sagan, Frank Drake; dessin de Linda Salzman Sagan (NASA)"}),
    ("pioneer10", "Pioneer 10 Jupiter 1974 GPN-2000-001698.jpg",
     "Jupiter vue par Pioneer 10, premier survol de la planète géante, 1973", {}),

    ("pioneer11", "An artist's impression of a Pioneer spacecraft on its way to interstellar space.jpg",
     "Une sonde Pioneer en route vers l'espace interstellaire (illustration de Don Davis)", {}),
    ("pioneer11", "Pioneer 11 Image of Saturn and Its Moon Titan.jpg",
     "Saturne et Titan photographiées par Pioneer 11, premier survol de Saturne, 1979", {}),

    ("newhorizons", "New Horizons Transparent.png",
     "La sonde New Horizons (illustration NASA/JHUAPL/SwRI)",
     {"credit": "NASA / Johns Hopkins University APL / Southwest Research Institute"}),
    ("newhorizons", "Atlas V 551 with New Horizons on Launch Pad 41.jpg",
     "La fusée Atlas V et New Horizons sur leur pas de tir, janvier 2006", {"pos": "center 30%"}),
    ("newhorizons", "UltimaThule CA06 color 20190516.png",
     "Arrokoth, l'objet le plus lointain jamais survolé, New Horizons, 1er janvier 2019",
     {"credit": "NASA / Johns Hopkins University APL / Southwest Research Institute"}),
]

FREE = re.compile(r"public domain|^pd|cc0|cc[ -]by", re.I)


def api(**params):
    params.update(format="json", formatversion="2")
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


def clean(html):
    text = unescape(re.sub(r"<[^>]+>", " ", html or ""))
    return re.sub(r"\s+", " ", text).strip()


def fetch_meta(titles):
    meta = {}
    for i in range(0, len(titles), 40):
        batch = titles[i:i + 40]
        r = api(action="query", titles="|".join("File:" + t for t in batch), prop="imageinfo",
                iiprop="url|size|extmetadata", iiurlwidth=1200)
        norm = {n["to"]: n["from"] for n in r["query"].get("normalized", [])}
        for page in r["query"]["pages"]:
            title = norm.get(page["title"], page["title"])[5:]
            if page.get("missing"):
                raise SystemExit(f"Missing on Commons: {title}")
            meta[title] = page["imageinfo"][0]
    return meta


def download(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except Exception as exc:  # noqa: BLE001 — retry on rate limits / timeouts
            if attempt == 3:
                raise
            print(f"  retry ({exc})")
            time.sleep(3 * (attempt + 1))


def to_webp(data, path):
    img = Image.open(io.BytesIO(data))
    img.load()
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGBA", img.size, (2, 3, 10, 255))   # page background colour
        img = Image.alpha_composite(bg, img)
    img = img.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    img.save(path, "WEBP", quality=QUALITY, method=6)
    return img.size


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    titles = sorted({t for _, t, _, _ in CATALOG})
    meta = fetch_meta(titles)
    photos, counters, credits = {}, {}, []
    for oid, title, caption, extra in CATALOG:
        info = meta[title]
        em = info.get("extmetadata", {})
        lic = clean(em.get("LicenseShortName", {}).get("value"))
        if not FREE.search(lic):
            raise SystemExit(f"Non-free or unknown licence for {title}: {lic!r}")
        artist = extra.get("credit") or clean(em.get("Artist", {}).get("value")) or clean(em.get("Credit", {}).get("value"))
        if len(artist) > 140:
            artist = artist[:137].rsplit(" ", 1)[0] + "…"
        n = counters.get(oid, 0) + 1
        counters[oid] = n
        name = f"{oid}-{n}.webp"
        dest = OUT_DIR / name
        print(f"{name:22s} <- {title}")
        w, h = to_webp(download(info.get("thumburl") or info["url"]), dest)
        entry = {
            "file": f"images/photos/{name}",
            "caption": caption,
            "credit": artist,
            "license": lic,
            "licenseUrl": em.get("LicenseUrl", {}).get("value") or None,
            "sourceUrl": info["descriptionurl"],
            "width": w,
            "height": h,
        }
        if extra.get("pos"):
            entry["pos"] = extra["pos"]
        photos.setdefault(oid, []).append(entry)
        credits.append((name, title, caption, artist, lic, entry["licenseUrl"], info["descriptionurl"]))
        time.sleep(0.3)

    js = ("// Real photographs shown in the info panel — GENERATED by tools/fetch-photos.py, do not edit.\n"
          "// Source: Wikimedia Commons; licences and authors in CREDITS.md.\n"
          f"export const PHOTOS = {json.dumps(photos, ensure_ascii=False, indent=2)};\n")
    (ROOT / "src" / "data" / "photos.js").write_text(js, encoding="utf-8", newline="\n")

    lines = ["# Crédits photos", "",
             "Les photographies affichées dans la fiche d'information proviennent de "
             "[Wikimedia Commons](https://commons.wikimedia.org/). Elles ont été redimensionnées "
             "et converties en WebP (`tools/fetch-photos.py`). Les œuvres sous licence CC BY-SA "
             "restent sous leur licence d'origine.", "",
             "| Fichier | Sujet | Auteur / crédit | Licence | Source |", "|---|---|---|---|---|"]
    for name, title, caption, artist, lic, lic_url, src in credits:
        lic_md = f"[{lic}]({lic_url})" if lic_url else lic
        safe = lambda s: s.replace("|", "\\|")
        lines.append(f"| `{name}` | {safe(caption)} | {safe(artist)} | {safe(lic_md)} | [{safe(title)}]({src}) |")
    (ROOT / "CREDITS.md").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    total = sum(p.stat().st_size for p in OUT_DIR.glob("*.webp"))
    print(f"\n{len(credits)} photos, {total / 1e6:.2f} MB")


if __name__ == "__main__":
    sys.exit(main())
