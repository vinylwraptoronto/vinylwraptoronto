import json

p = 'src/data/pages/car-wrap-faqs.json'
s = open(p, encoding='utf-8').read()
n1 = s.count('<h3>')
s2 = s.replace('<h3>', '<h2 style=\\"font-size:22px\\">').replace('</h3>', '</h2>')
open(p, 'w', encoding='utf-8').write(s2)
print('replaced', n1)
json.load(open(p, encoding='utf-8'))
print('valid json')
