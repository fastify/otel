'use strict'

const Fastify = require('fastify')

const app = Fastify()

app.get('/', () => 'hello world')

app.listen({ port: 3000 }).then((address) => {
  app.log.info(`listening on ${address}`)
})
