import { Editor } from 'slate'
import { CollabEditor } from './collab-editor'

import withCollabCore, { CollabCoreOptions } from './withCollabCore'
import withSocketIO, {
  WithSocketIOEditor,
  SocketIOPluginOptions
} from './withSocketIO'

/**
 * The `withIOCollaboration` plugin contains collaboration with SocketIO.
 */

const withIOCollaboration = <T extends Editor>(
  editor: T,
  options: CollabCoreOptions & SocketIOPluginOptions
): T & WithSocketIOEditor & CollabEditor =>
  withSocketIO(withCollabCore(editor, options), options)

export default withIOCollaboration
