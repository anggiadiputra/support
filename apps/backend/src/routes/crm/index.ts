import { Hono } from 'hono'
import pipelineRoutes from './pipelines.js'
import customFieldRoutes from './custom-fields.js'
import autoTaggingRoutes from './auto-tagging.js'

const app = new Hono()

app.route('/', pipelineRoutes)
app.route('/', customFieldRoutes)
app.route('/', autoTaggingRoutes)

export default app
