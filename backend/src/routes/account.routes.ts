import { Router } from 'express'
import { postLogout, postSignIn, postSignUp, putProfile } from '../controllers/account.controller'
import { getUserdata, putUserdata } from '../controllers/userdata.controller'

export const accountRouter = Router()

accountRouter.post('/signup', postSignUp)
accountRouter.post('/login', postSignIn)
accountRouter.post('/logout', postLogout)
accountRouter.put('/profile', putProfile)

export const userDataRouter = Router()

userDataRouter.get('/', getUserdata)
userDataRouter.put('/', putUserdata)
