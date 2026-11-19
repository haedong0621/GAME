/**
 * Tiled 오브젝트의 커스텀 속성 읽기.
 * Tiled는 속성을 [{name, type, value}] 배열로 저장한다.
 */
export function getProperty(obj, name, fallback = undefined) {
  const props = obj.properties;
  if (Array.isArray(props)) {
    const p = props.find((it) => it.name === name);
    return p ? p.value : fallback;
  }
  return props && name in props ? props[name] : fallback;
}
