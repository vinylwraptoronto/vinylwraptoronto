import json

home_map = {
  "Chevrolet - Silverado - 2018 - Decals - PandK Roofing - Lettering - Vinyl Wrap Toronto - Stickers - Vehicle Wrap in Etobicoke - Custom Truck Decals":
    "2018 Chevrolet Silverado truck decals and lettering for PandK Roofing in Etobicoke",
  "Partial Truck Wrap - Hungarock Seirra - Vinyl Wrap Toronto - Vehicle Wrap - Racing Stripes - Window Tinting - Lettering & Decals Cost":
    "Partial truck wrap with racing stripes on a Hungarock Sierra",
  "Mazda - 3 - 2019 - Decals - Personal - Racing Stripes - Vinyl Wrap Toronto - Vehicle Wrap in Etobicoke - Custom Vinyl Racing Stripes Cost":
    "2019 Mazda 3 with personal racing stripe decals in Etobicoke",
  "Partial Wrap Car Fine Tune-Auto Mustang Saleen Side-After vinyl wrap Toronto - Racing Stripes, Decals, Car Wrap, Etobicoke - Vinyl Wrap Cost":
    "Ford Mustang Saleen partial wrap with racing stripes, side view after installation",
  "Van Lettering & Decals - Home Free Nissan - Business advertising - Vinyl Wrap Toronto - Home Free Nissan - Auto Tinting Near Me":
    "Nissan van lettering and decals for Home Free business advertising",
  "RAM - Promaster City - 2019 - Partial - Zuccarini - Van Wrap - Vinyl Wrap Toronto - Vehicle Wrap in Etobicoke - van decals cost":
    "2019 RAM Promaster City partial van wrap for Zuccarini in Etobicoke",
  "Hyundai SUV - Tuscan - 2018 - Partial - Personal - Vinyl Wrap Toronto - Window Tinting - Vehicle Wrap in GTA - Custom Vinyl Wraps":
    "2018 Hyundai Tuscan SUV with personal partial vinyl wrap",
  "Vinyl Wrap Toronto Kawasaki Ninja ZX-10R 2019 Avery Dennison White Motorcycle Full Vinyl Wrap Toronto After - Bike Wrap - Custom Vehicle Wrap Cost":
    "2019 Kawasaki Ninja ZX-10R full white vinyl wrap by Avery Dennison, after installation",
}

fullwrap_map = {
  "Toyota Highlander Hybrid - Full Car Wrap - Commercial Wrap - 680 News - VinylWrapToronto.com - Best Vehicle Wrap in Toronto - Side - Car wrap cost":
    "Toyota Highlander Hybrid full car wrap for 680 News, side view",
  "Audi A4 2006 - Full Car Wrap - VinylWrapToronto.com - Sand Vinyl Wrap Toronto - Vehicle Wrap - Side Front - Personal - Car wrap price":
    "2006 Audi A4 full car wrap in sand finish, side-front view",
  "Smart Car - Fortwo - Cabriolet - 2008 - Custom Full Wrap - Vinyl Wrap Toronto - VinylWrapToronto.com - Side Full - Vehicle Wrap - Car Wrap in GTA":
    "2008 Smart Fortwo Cabriolet custom full car wrap, side view",
  "Hyundai Veloster - 2016 Full Wrap - Personal - Full Wrap Truck Wrap in Toronto - Paint Protection Films - Avery Dennison & 3M - Satin Purple - Etobicoke - Car Wrap Cost in Toronto GTA":
    "2016 Hyundai Veloster personal full wrap in satin purple, Avery Dennison and 3M film",
  "Volkswagen Beetle - Full Wrap - Personal - Disney - Cinderella Theme - Avery Dennison - Vinyl Wrap Toronto - After - Top - Quality car wrap near me":
    "Volkswagen Beetle full wrap with Disney Cinderella theme, after installation",
  "Tesla Model 3 2020 - Personal - Full Wrap - Vinyl Wrap Toronto - Car Wrap in GTA - Avery Dennison - 3M - Satin Black - Avery and 3M vinyl wraps":
    "2020 Tesla Model 3 personal full wrap in satin black, Avery Dennison and 3M film",
}

def apply(path, mapping):
    d = json.load(open(path, encoding='utf-8'))
    count = 0
    def walk(o):
        nonlocal count
        if isinstance(o, dict):
            if 'alt' in o and isinstance(o.get('alt'), str) and o['alt'] in mapping:
                o['alt'] = mapping[o['alt']]
                count += 1
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(d)
    json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
    print(path, 'replaced', count)

apply('src/data/pages/index.json', home_map)
apply('src/data/pages/full-car-wrap-toronto.json', fullwrap_map)
