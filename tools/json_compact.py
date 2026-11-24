"""JSON을 사람이 읽기 좋게: 짧은 묶음(한 줄 100자 안)과 글자·숫자만 든 목록은 한 줄로, 긴 것만 펼쳐 씀.
사용: python3 tools/json_compact.py data/dialogues.json [...]  (제자리에서 다시 씀)"""
import json, sys

WIDTH = 100

def inline(v):
    s = json.dumps(v, ensure_ascii=False, separators=(', ', ': '))
    return f'{{ {s[1:-1]} }}' if isinstance(v, dict) and v else s

def dump(v, depth=0, col=0):
    one = inline(v)
    scalars = isinstance(v, list) and all(not isinstance(x, (dict, list)) for x in v)
    if not isinstance(v, (dict, list)) or scalars or col + len(one) <= WIDTH:
        return one
    pad = '  ' * (depth + 1)
    if isinstance(v, dict):
        rows = []
        for k, x in v.items():
            key = f'{pad}{json.dumps(k, ensure_ascii=False)}: '
            rows.append(key + dump(x, depth + 1, len(key)))
        return '{\n' + ',\n'.join(rows) + '\n' + '  ' * depth + '}'
    return '[\n' + ',\n'.join(pad + dump(x, depth + 1, len(pad)) for x in v) + '\n' + '  ' * depth + ']'

if __name__ == '__main__':
    for p in sys.argv[1:]:
        d = json.load(open(p, encoding='utf-8'))
        open(p, 'w', encoding='utf-8').write(dump(d) + '\n')
