import { RemoveNodeOperation } from 'slate'

import { SyncDoc } from '../../model'
import { getParent, getChildren } from '../../path'

export const removeNode = (doc: SyncDoc, op: RemoveNodeOperation): SyncDoc => {
  const [parent, index] = getParent(doc, op.path)

  if (parent.text) {
    throw new TypeError("Can't remove node from text node")
  }

  getChildren(parent).splice(index, 1)

  return doc
}

export default removeNode
