import type { RequestHandler } from 'express';
import * as questionService from '../services/question.service.js';

export const createQuestion: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await questionService.createQuestion(req.user!, req.body));
  } catch (err) {
    next(err);
  }
};
