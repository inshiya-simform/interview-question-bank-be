import type { RequestHandler } from 'express';
import * as tagService from '../services/tag.service.js';

export const listTags: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await tagService.listTagCategories());
  } catch (err) {
    next(err);
  }
};
