import { db } from '../db.js'
import { Router } from 'express'

const router = Router()

router.get('/', (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) AS c FROM awards').get().c
    res.json({ db: 'ok', count })
  } catch (e) {
    res.status(500).json({ db: 'error', error: e.message })
  }
})

export default router
