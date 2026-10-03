"""Refill shipping quotes — keep in sync with candle-garden-mobile/lib.

Live Shippo rates (USPS in test) are used when SHIPPO_API_TOKEN is set.
Direct UPS Rating is kept in ups_client but off unless UPS_ENABLED=true.
Otherwise the published Ground Saver table is used so the app still quotes.
"""

from math import ceil

try:
    import shippo_client
except ImportError:
    shippo_client = None

try:
    import ups_client
except ImportError:
    ups_client = None

WAX_CENTS_STANDARD = 175
WAX_CENTS_EXPEDITED = 225
WAX_CENTS_PER_OZ = WAX_CENTS_STANDARD
EXPEDITED_AIR_MULTIPLIER = 2.2
ORIGIN_ZIP = "32233"
ORIGIN_PARTY = {
    "name": "The Candle Garden",
    "attention": "Refill Desk",
    "phone": "9043167608",
    "email": "jordan@thecandlegarden.co",
    "address": "363 Atlantic Boulevard, Suite 8",
    "address2": "",
    "city": "Atlantic Beach",
    "state": "FL",
    "zip": ORIGIN_ZIP,
    "country": "US",
}
RESIDENTIAL_CENTS = 465
FUEL_PCT = 0.16
MAX_TABLE_LB = 24
VOLUME_FACTOR = 1.65
OZ_TO_VESSEL_CU_IN = 2.4
GLASS_OZ_PER_FILL = 1.1
MIN_EMPTY_VESSEL_OZ = 5.0
WAX_OZ_PER_FILL = 1.0
WRAP_OZ_PER_VESSEL = 1.75
TAPE_OZ = 1.0
VOID_OZ_PER_CU_IN = 0.008
MIN_VOID_OZ = 1.0
DIM_DIVISOR = 166
METHOD3_MAX_BILLED_LB = 20
METHOD3_MAX_LENGTH = 18
METHOD3_MAX_GIRTH_PLUS = 84

GROUND_SAVER = {
    2: [None, 13.0, 13.99, 14.54, 14.94, 15.31, 15.44, 16.29, 16.73, 16.98, 21.77, 23.05, 23.27, 23.36, 24.41, 24.43, 25.05, 25.23, 25.5, 26.1, 26.11, 27.23, 27.24, 27.25, 28.22],
    3: [None, 13.51, 15.37, 16.14, 16.25, 16.95, 17.02, 17.39, 18.0, 18.25, 23.38, 23.84, 24.86, 24.94, 25.65, 26.0, 26.94, 27.5, 27.92, 29.19, 29.2, 30.35, 30.86, 31.22, 32.74],
    4: [None, 14.68, 16.71, 17.42, 18.12, 18.55, 18.72, 19.2, 19.86, 19.92, 25.62, 26.1, 26.35, 26.51, 26.91, 27.31, 27.79, 28.11, 28.39, 29.77, 29.82, 31.39, 32.46, 33.19, 34.89],
    5: [None, 15.31, 17.07, 18.27, 19.25, 20.09, 20.17, 20.8, 21.37, 21.55, 28.16, 28.49, 28.74, 29.08, 30.02, 30.86, 31.62, 32.5, 34.05, 35.55, 36.68, 37.39, 38.66, 39.11, 41.47],
    6: [None, 15.82, 17.78, 19.01, 19.77, 20.88, 20.89, 21.26, 22.1, 22.56, 29.14, 29.89, 30.94, 31.91, 33.77, 35.63, 37.07, 38.34, 40.34, 41.37, 42.8, 44.42, 46.23, 47.98, 50.63],
    7: [None, 15.99, 18.43, 19.62, 21.03, 21.97, 21.98, 22.57, 23.45, 24.41, 32.68, 35.25, 36.94, 39.03, 41.98, 42.98, 45.56, 47.53, 49.34, 50.29, 52.16, 53.98, 55.96, 57.31, 59.24],
    8: [None, 16.26, 18.73, 20.56, 21.98, 23.26, 23.27, 24.11, 25.14, 26.46, 36.15, 38.88, 40.39, 42.35, 45.82, 47.94, 50.06, 50.33, 54.25, 56.9, 58.93, 60.72, 63.39, 65.92, 69.67],
}

PREFIX_ZONES = [
    (320, 322, 2), (323, 326, 2), (327, 349, 3), (300, 319, 3), (350, 369, 3),
    (290, 299, 3), (370, 385, 4), (386, 397, 4), (270, 289, 4), (400, 427, 4),
    (700, 714, 4), (716, 729, 4), (197, 199, 5), (200, 268, 5), (150, 196, 5),
    (430, 499, 5), (500, 528, 5), (530, 549, 5), (600, 658, 5), (660, 679, 5),
    (730, 799, 5), (100, 149, 6), (70, 89, 6), (10, 69, 6), (550, 588, 6),
    (680, 693, 6), (870, 884, 6), (590, 599, 7), (800, 838, 7), (840, 865, 7),
    (889, 898, 7), (900, 961, 8), (970, 994, 8),
]

BOXES = {
    "ups_small": {"key": "ups_small", "name": "Small carton", "l": 10, "w": 8, "h": 6, "tare": 8, "soft": 1},
    "ups_medium": {"key": "ups_medium", "name": "Medium carton", "l": 12, "w": 10, "h": 8, "tare": 12, "soft": 3},
    "ups_large": {"key": "ups_large", "name": "Large carton", "l": 14, "w": 12, "h": 10, "tare": 16, "soft": 6},
}
KIT = {"l": 12, "w": 10, "h": 2, "tare": 14}
ALIASES = {
    "frb_small": "ups_small",
    "small": "ups_small",
    "frb_medium_top": "ups_medium",
    "frb_medium_side": "ups_medium",
    "medium": "ups_medium",
    "frb_large": "ups_large",
    "large": "ups_large",
}
FIT_ORDER = ["ups_small", "ups_medium", "ups_large"]
METHODS = {
    "ship_own": {"title": "Ship on your own", "charges": 1, "legs": ["refills_out"]},
    "kit_roundtrip": {"title": "We send packing", "charges": 3, "legs": ["kit_out", "empties_in", "refills_out"]},
    "prepaid_labels": {"title": "Prepaid labels", "charges": 2, "legs": ["empties_in", "refills_out"]},
}

LEG_TITLES = {
    "kit_out": "Packing kit out",
    "empties_in": "Empties inbound",
    "refills_out": "Refills back to customer",
}

# Buy only the customer-printable inbound label at payment.
# Kit-out and refills-out stay queued until staff prints them.
PAY_NOW_LEGS = ("empties_in",)


def method_legs(shipping_method):
    method = shipping_method if shipping_method in METHODS else "ship_own"
    return list(METHODS[method]["legs"])


def label_purchase_plan(shipping_method):
    legs = method_legs(shipping_method)
    now = [key for key in legs if key in PAY_NOW_LEGS]
    queued = [key for key in legs if key not in PAY_NOW_LEGS]
    return {"method": shipping_method if shipping_method in METHODS else "ship_own", "now": now, "queued": queued, "legs": legs}


def _zip_digits(zip_code):
    return "".join(ch for ch in str(zip_code or "") if ch.isdigit())[:5]


def _zone(zip_code):
    z = _zip_digits(zip_code)
    if len(z) < 5:
        raise ValueError("Enter a 5-digit U.S. ZIP for UPS Ground Saver")
    prefix = int(z[:3])
    if prefix < 10 or 90 <= prefix <= 99 or 967 <= prefix <= 968 or prefix >= 995:
        raise ValueError("UPS Ground Saver quotes cover the 48 contiguous states only")
    for start, end, zone in PREFIX_ZONES:
        if start <= prefix <= end:
            return zone
    return 5


def _resolve_box(key):
    if key in BOXES:
        return BOXES[key]
    mapped = ALIASES.get(str(key or ""))
    if mapped:
        return BOXES[mapped]
    return None


def _billed_lb(oz):
    return max(1, ceil(max(0.0, float(oz)) / 16.0))


def _dim_lb(box):
    return max(1, ceil((box["l"] * box["w"] * box["h"]) / DIM_DIVISOR))


def _empty_vessel(fill_oz):
    return max(MIN_EMPTY_VESSEL_OZ, float(fill_oz) * GLASS_OZ_PER_FILL)


def _packed_volume(total_wax, vessel_count):
    count = max(1, int(vessel_count or 1))
    raw = max(0.0, float(total_wax or 0)) * OZ_TO_VESSEL_CU_IN
    return raw * VOLUME_FACTOR, count


def recommend_box(total_wax, vessel_count=1):
    packed, count = _packed_volume(total_wax, vessel_count)
    for key in FIT_ORDER:
        box = BOXES[key]
        usable = box["l"] * box["w"] * box["h"] * 0.65
        if packed <= usable and count <= box["soft"]:
            return box
    return BOXES["ups_large"]


def packed_weight(total_wax, vessel_count, box):
    count = max(1, int(vessel_count or 1))
    each = max(0.0, float(total_wax or 0)) / count
    empty = sum(_empty_vessel(each) for _ in range(count))
    wax = each * WAX_OZ_PER_FILL * count
    wrap = count * WRAP_OZ_PER_VESSEL
    packed_cu, _ = _packed_volume(total_wax, count)
    unused = max(0.0, box["l"] * box["w"] * box["h"] - packed_cu)
    void = max(MIN_VOID_OZ, unused * VOID_OZ_PER_CU_IN)
    packing = wrap + void + TAPE_OZ
    empties = empty + box["tare"] + packing
    refills = empties + wax
    dim = _dim_lb(box)
    kit_oz = KIT["tare"] + wrap + MIN_VOID_OZ + TAPE_OZ
    return {
        "empties_billed": max(_billed_lb(empties), dim),
        "refills_billed": max(_billed_lb(refills), dim),
        "kit_billed": max(_billed_lb(kit_oz), _dim_lb(KIT)),
    }


def _customer_party(dest_zip, dest=None):
    dest = dest or {}
    zip_code = "".join(ch for ch in str(dest.get("zip") or dest_zip or "") if ch.isdigit())[:5]
    return {
        "name": dest.get("name") or "Customer",
        "attention": dest.get("name") or "Customer",
        "phone": dest.get("phone") or "9043167608",
        "email": dest.get("email") or "jordan@thecandlegarden.co",
        "address": dest.get("address") or "Address",
        "address2": dest.get("address2") or dest.get("street2") or "",
        "city": dest.get("city") or "City",
        "state": (dest.get("state") or "FL")[:2].upper(),
        "zip": zip_code,
        "country": "US",
        "residential": True,
    }


def _dims_for_leg(leg_key, box):
    if leg_key == "kit_out":
        return KIT["l"], KIT["w"], KIT["h"]
    return box["l"], box["w"], box["h"]


def _leg_parties(leg_key, dest_zip, dest=None):
    customer = _customer_party(dest_zip, dest)
    origin = dict(ORIGIN_PARTY)
    if leg_key == "empties_in":
        return customer, origin, True
    return origin, customer, False


def normalize_speed(speed):
    raw = str(speed or "").strip().lower()
    if raw in ("expedited", "express", "2nd_day", "2nd-day-air", "air"):
        return "expedited"
    return "standard"


def wax_cents_per_oz(speed="standard"):
    return WAX_CENTS_EXPEDITED if normalize_speed(speed) == "expedited" else WAX_CENTS_STANDARD


def _leg_cents_live_or_table(leg_key, zone, billed_lb, box, dest_zip, dest=None, speed="standard"):
    residential = leg_key != "empties_in"
    table_cents, lb, z = _leg_cents(zone, billed_lb, residential=residential)
    expedited = normalize_speed(speed) == "expedited"
    if expedited:
        table_cents = int(round(table_cents * EXPEDITED_AIR_MULTIPLIER))
    length, width, height = _dims_for_leg(leg_key, box)
    ship_from, ship_to, is_return = _leg_parties(leg_key, dest_zip, dest)
    if expedited:
        if ups_client and ups_client.configured():
            try:
                live_cents = ups_client.rate_package(
                    ship_from, ship_to, billed_lb, length, width, height,
                    service_code=ups_client.SERVICE_2ND_DAY_AIR,
                )
                return live_cents, lb, z, "ups", {"provider": "UPS", "service": "2nd Day Air"}
            except Exception:
                pass
        if shippo_client and shippo_client.configured():
            try:
                live = shippo_client.lowest_rate(
                    ship_from, ship_to, billed_lb, length, width, height,
                    is_return=is_return, prefer_2nd_day=True,
                )
                return live["cents"], lb, z, "shippo", live
            except Exception:
                pass
        return table_cents, lb, z, "table", {"provider": "UPS", "service": "2nd Day Air"}
    if shippo_client and shippo_client.configured():
        try:
            live = shippo_client.lowest_rate(
                ship_from, ship_to, billed_lb, length, width, height, is_return=is_return
            )
            return live["cents"], lb, z, "shippo", live
        except Exception:
            pass
    if ups_client and ups_client.configured():
        try:
            live_cents = ups_client.rate_ground_saver(
                ship_from, ship_to, billed_lb, length, width, height
            )
            return live_cents, lb, z, "ups", None
        except Exception:
            pass
    return table_cents, lb, z, "table", None


def _leg_cents(zone, billed_lb, residential=True):
    lb = max(1, min(MAX_TABLE_LB, int(billed_lb)))
    if billed_lb > MAX_TABLE_LB:
        raise ValueError(f"This pack is over {MAX_TABLE_LB} lb billed — contact us for a custom quote")
    zone = max(2, min(8, int(zone)))
    base = GROUND_SAVER[zone][lb]
    fuel = base * FUEL_PCT
    res = (RESIDENTIAL_CENTS / 100.0) if residential else 0.0
    return int(round((base + fuel + res) * 100)), lb, zone


def quote_refill_shipping(
    ounces,
    quantity=1,
    box_key=None,
    dest_zip=None,
    shipping_method="ship_own",
    vessel_count=None,
    dest=None,
    speed="standard",
):
    qty = max(1, int(quantity or 1))
    total_wax = float(ounces) * qty
    count = max(1, int(vessel_count or qty))
    method_key = shipping_method if shipping_method in METHODS else "ship_own"
    method = METHODS[method_key]
    speed_key = normalize_speed(speed)
    rec = recommend_box(total_wax, count)
    box = _resolve_box(box_key) or rec
    weights = packed_weight(total_wax, count, box)
    zone = _zone(dest_zip)

    if method_key == "prepaid_labels":
        sides = sorted([box["l"], box["w"], box["h"]], reverse=True)
        length = sides[0]
        girth_plus = length + 2 * (sides[1] + sides[2])
        if length > METHOD3_MAX_LENGTH or girth_plus > METHOD3_MAX_GIRTH_PLUS:
            raise ValueError("This box is over the prepaid-label size cap")
        if weights["refills_billed"] > METHOD3_MAX_BILLED_LB:
            raise ValueError("Packed weight is over the prepaid-label cap")

    legs = []
    sources = []
    services = []

    def add_leg(key, billed):
        cents, lb, z, src, live = _leg_cents_live_or_table(
            key, zone, billed, box, dest_zip, dest, speed=speed_key
        )
        row = {"key": key, "cents": cents, "billedLb": lb, "zone": z}
        if live:
            row["service"] = live.get("service")
            row["provider"] = live.get("provider")
            services.append(f"{live.get('provider')} {live.get('service')}".strip())
        legs.append(row)
        sources.append(src)

    if method_key == "kit_roundtrip":
        add_leg("kit_out", weights["kit_billed"])
    if method_key in ("kit_roundtrip", "prepaid_labels"):
        add_leg("empties_in", weights["empties_billed"])
    add_leg("refills_out", weights["refills_billed"])

    shipping_cents = sum(row["cents"] for row in legs)
    wax_cents = int(round(float(ounces) * wax_cents_per_oz(speed_key) * qty))
    unique_sources = set(sources)
    if unique_sources == {"shippo"}:
        rate_source = "shippo"
    elif unique_sources == {"ups"}:
        rate_source = "ups"
    elif unique_sources == {"table"}:
        rate_source = "table"
    else:
        rate_source = "mixed"
    return {
        "wax_cents": wax_cents,
        "shipping_cents": shipping_cents,
        "total_cents": wax_cents + shipping_cents,
        "box_key": box["key"],
        "box_name": box["name"],
        "method": method_key,
        "method_title": method["title"],
        "speed": speed_key,
        "zone": zone,
        "rate_source": rate_source,
        "service_summary": " + ".join(services) if services else None,
        "legs": legs,
        "weights": weights,
        "box": box,
    }
