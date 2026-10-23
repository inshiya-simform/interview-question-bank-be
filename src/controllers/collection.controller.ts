import type { RequestHandler } from 'express';
import * as collectionService from '../services/collection.service.js';
import {
  collectionIdParamSchema,
  listSavedQuestionsQuerySchema,
  questionIdParamSchema,
} from '../validators/collection.validators.js';

export const listCollections: RequestHandler = async (req, res, next) => {
  try {
    res.json(await collectionService.listCollections(req.user!));
  } catch (err) {
    next(err);
  }
};

export const createCollection: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await collectionService.createCollection(req.user!, req.body));
  } catch (err) {
    next(err);
  }
};

export const renameCollection: RequestHandler = async (req, res, next) => {
  try {
    const { id } = collectionIdParamSchema.parse(req.params);
    res.json(await collectionService.renameCollection(req.user!, id, req.body));
  } catch (err) {
    next(err);
  }
};

export const deleteCollection: RequestHandler = async (req, res, next) => {
  try {
    const { id } = collectionIdParamSchema.parse(req.params);
    await collectionService.deleteCollection(req.user!, id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export const listSavedQuestions: RequestHandler = async (req, res, next) => {
  try {
    const query = listSavedQuestionsQuerySchema.parse(req.query);
    res.json(await collectionService.listSavedQuestions(req.user!, query));
  } catch (err) {
    next(err);
  }
};

export const saveQuestion: RequestHandler = async (req, res, next) => {
  try {
    const { questionId } = questionIdParamSchema.parse(req.params);
    res.json(await collectionService.saveQuestion(req.user!, questionId, req.body));
  } catch (err) {
    next(err);
  }
};

export const unsaveQuestion: RequestHandler = async (req, res, next) => {
  try {
    const { questionId } = questionIdParamSchema.parse(req.params);
    await collectionService.unsaveQuestion(req.user!, questionId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
