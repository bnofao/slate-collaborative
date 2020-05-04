import * as Automerge from 'automerge'

import { toSlatePath, toJS } from '../utils'

const setDataOp = ({ path, value }: Automerge.Diff) => (map: any) => ({
  type: 'set_node',
  path: toSlatePath(path),
  properties: {},
  newProperties: {
    data: map[value]
  }
})

const setByType = {
  data: setDataOp
}

const opSet = (op: Automerge.Diff, [map, ops]: any, doc: any) => {
  const { link, value, path, obj, key } = op
  try {
    const set = setByType[key as any]

    if (set && path) {
      ops.push(set(op))
    } else if (map[obj]) {
      map[obj][key as any] = link ? map[value] : value
    }

    return [map, ops]
  } catch (e) {
    console.error(e, op, toJS(map))

    return [map, ops]
  }
}

export default opSet
