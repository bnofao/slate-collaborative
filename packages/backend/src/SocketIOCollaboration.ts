import io from 'socket.io'
import * as Automerge from 'automerge'
import { Element } from 'slate'
import { Server } from 'http'

import throttle from 'lodash/throttle'

import { SyncDoc, CollabAction, toJS } from '@slate-collaborative/bridge'

import { getClients } from './utils'

import CollaborationBackend from './CollaborationBackend'

export interface SocketIOCollaborationOptions {
  entry: number | Server
  connectOpts?: SocketIO.ServerOptions
  defaultValue?: Element[]
  saveFrequency?: number
  onAuthRequest?: (
    query: Object,
    socket?: SocketIO.Socket
  ) => Promise<boolean> | boolean
  onDocumentLoad?: (pathname: string, query?: Object) => Element[]
  onDocumentSave?: (pathname: string, doc: Element[]) => Promise<void> | void
}

export default class SocketIOCollaboration {
  private io: SocketIO.Server
  private options: SocketIOCollaborationOptions
  private collab: CollaborationBackend

  /**
   * Constructor
   */

  constructor(options: SocketIOCollaborationOptions) {
    this.io = io(options.entry, options.connectOpts)

    this.collab = new CollaborationBackend()

    this.options = options

    this.configure()

    return this
  }

  /**
   * Initial IO configuration
   */

  private configure = () =>
    this.io
      .of(this.nspMiddleware)
      .use(this.authMiddleware)
      .on('connect', this.onConnect)

  /**
   * Namespace SocketIO middleware. Load document value and append it to CollaborationBackend.
   */

  private nspMiddleware = async (path: string, query: any, next: any) => {
    const { onDocumentLoad } = this.options

    if (!this.collab.getDocument(path)) {
      const doc = onDocumentLoad
        ? await onDocumentLoad(path)
        : this.options.defaultValue

      if (!doc) return next(null, false)

      this.collab.appendDocument(path, doc)
    }

    return next(null, true)
  }

  /**
   * SocketIO auth middleware. Used for user authentification.
   */

  private authMiddleware = async (
    socket: SocketIO.Socket,
    next: (e?: any) => void
  ) => {
    const { query } = socket.handshake
    const { onAuthRequest } = this.options

    if (onAuthRequest) {
      const permit = await onAuthRequest(query, socket)

      if (!permit)
        return next(new Error(`Authentification error: ${socket.id}`))
    }

    return next()
  }

  /**
   * On 'connect' handler.
   */

  private onConnect = (socket: SocketIO.Socket) => {
    const { id, conn } = socket
    const { name } = socket.nsp

    this.collab.createConnection(id, ({ type, payload }: CollabAction) => {
      socket.emit('msg', { type, payload: { id: conn.id, ...payload } })
    })

    socket.join(id, () => {
      const doc = this.collab.getDocument(name)

      socket.emit('msg', {
        type: 'document',
        payload: Automerge.save<SyncDoc>(doc)
      })

      this.collab.openConnection(id)
    })

    socket.on('msg', this.onMessage(id, name))

    socket.on('disconnect', this.onDisconnect(id, socket))

    this.garbageCursors(name)
  }

  /**
   * On 'message' handler
   */

  private onMessage = (id: string, name: string) => (data: any) => {
    switch (data.type) {
      case 'operation':
        try {
          this.collab.receiveOperation(id, data)

          this.autoSaveDoc(name)

          this.garbageCursors(name)
        } catch (e) {
          console.log(e)
        }
    }
  }

  /**
   * Save document with throttle
   */

  private autoSaveDoc = throttle(
    async (docId: string) => this.saveDocument(docId),
    this.options?.saveFrequency || 2000
  )

  /**
   * Save document
   */

  private saveDocument = async (docId: string) => {
    const { onDocumentSave } = this.options

    const doc = this.collab.getDocument(docId)

    onDocumentSave && (await onDocumentSave(docId, toJS(doc.children)))
  }

  /**
   * On 'disconnect' handler
   */

  private onDisconnect = (id: string, socket: SocketIO.Socket) => async () => {
    this.collab.closeConnection(id)

    socket.leave(id)

    this.garbageCursors(socket.nsp.name)

    await this.saveDocument(socket.nsp.name)

    this.garbageNsp()
  }

  /**
   * Clean up unused SocketIO namespaces.
   */

  garbageNsp = () => {
    Object.keys(this.io.nsps)
      .filter(n => n !== '/')
      .forEach(nsp => {
        getClients(this.io, nsp).then((clientsList: any) => {
          if (!clientsList.length) {
            this.collab.removeDocument(nsp)

            delete this.io.nsps[nsp]
          }
        })
      })
  }

  /**
   * Clean up unused cursor data.
   */

  garbageCursors = (nsp: string) => {
    const doc = this.collab.getDocument(nsp)

    if (!doc.cursors) return

    const namespace = this.io.of(nsp)

    Object.keys(doc?.cursors)?.forEach(key => {
      if (!namespace.sockets[key]) {
        this.collab.garbageCursor(nsp, key)
      }
    })
  }

  /**
   * Destroy SocketIO connection
   */

  destroy = async () => {
    this.io.close()
  }
}