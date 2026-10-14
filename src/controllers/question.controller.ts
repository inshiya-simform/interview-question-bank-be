import type { RequestHandler } from 'express';
import * as questionService from '../services/question.service.js';
import { listQuestionsQuerySchema } from '../validators/question.validators.js';

export const createQuestion: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await questionService.createQuestion(req.user!, req.body));
  } catch (err) {
    next(err);
  }
};

export const listQuestions: RequestHandler = async (req, res, next) => {
  try {
    const query = listQuestionsQuerySchema.parse(req.query);
    res.json(await questionService.listQuestions(req.user!, query));
  } catch (err) {
    next(err);
  }
};
