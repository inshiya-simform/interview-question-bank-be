import type { RequestHandler } from 'express';
import * as commentService from '../services/comment.service.js';
import {
  commentParamsSchema,
  createCommentSchema,
  listCommentsQuerySchema,
  listRepliesQuerySchema,
  mentionableQuerySchema,
  questionIdParamSchema,
  updateCommentSchema,
  voteSchema,
} from '../validators/comment.validators.js';

export const listComments: RequestHandler = async (req, res, next) => {
  try {
    const { questionId } = questionIdParamSchema.parse(req.params);
    const query = listCommentsQuerySchema.parse(req.query);
    res.json(await commentService.listComments(req.user!, questionId, query));
  } catch (err) {
    next(err);
  }
};

export const listReplies: RequestHandler = async (req, res, next) => {
  try {
    const { questionId, commentId } = commentParamsSchema.parse(req.params);
    const query = listRepliesQuerySchema.parse(req.query);
    res.json(await commentService.listReplies(req.user!, questionId, commentId, query));
  } catch (err) {
    next(err);
  }
};

export const listMentionableUsers: RequestHandler = async (req, res, next) => {
  try {
    const { questionId } = questionIdParamSchema.parse(req.params);
    const { q } = mentionableQuerySchema.parse(req.query);
    res.json(await commentService.listMentionableUsers(req.user!, questionId, q));
  } catch (err) {
    next(err);
  }
};

export const createComment: RequestHandler = async (req, res, next) => {
  try {
    const { questionId } = questionIdParamSchema.parse(req.params);
    const input = createCommentSchema.parse(req.body);
    res.status(201).json(await commentService.createComment(req.user!, questionId, input));
  } catch (err) {
    next(err);
  }
};

export const updateComment: RequestHandler = async (req, res, next) => {
  try {
    const { questionId, commentId } = commentParamsSchema.parse(req.params);
    const input = updateCommentSchema.parse(req.body);
    res.json(await commentService.updateComment(req.user!, questionId, commentId, input));
  } catch (err) {
    next(err);
  }
};

export const deleteComment: RequestHandler = async (req, res, next) => {
  try {
    const { questionId, commentId } = commentParamsSchema.parse(req.params);
    await commentService.deleteComment(req.user!, questionId, commentId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export const voteComment: RequestHandler = async (req, res, next) => {
  try {
    const { questionId, commentId } = commentParamsSchema.parse(req.params);
    const input = voteSchema.parse(req.body);
    res.json(await commentService.voteComment(req.user!, questionId, commentId, input));
  } catch (err) {
    next(err);
  }
};
