import { Hono } from 'hono'
import listCategories from './list.js'
import createCategory from './create.js'
import updateCategory from './update.js'
import deleteCategory from './delete.js'

const app = new Hono()

// Category routes
app.route('/', listCategories)
app.route('/', createCategory)
app.route('/', updateCategory)
app.route('/', deleteCategory)

export default app
