import Fastify from 'fastify'

const app = Fastify()

app.get('/', () => 'hello world')

app.listen({ port: Number(process.env.PORT ?? 3000) }).then((address) => {
  app.log.info(`listening on ${address}`)
})
