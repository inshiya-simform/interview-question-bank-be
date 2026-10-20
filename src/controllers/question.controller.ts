import type { RequestHandler } from 'express';
import * as questionService from '../services/question.service.js';
import * as questionExportService from '../services/questionExport.service.js';
import * as questionImportService from '../services/questionImport.service.js';
import {
  exportQuestionsQuerySchema,
  listQuestionsQuerySchema,
  listSubmissionsQuerySchema,
  questionIdParamSchema,
} from '../validators/question.validators.js';

export const createQuestion: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await questionService.createQuestion(req.user!, req.body));
  } catch (err) {
    next(err);
  }
};

export const checkDuplicate: RequestHandler = async (req, res, next) => {
  try {
    res.json(await questionService.checkDuplicate(req.user!, req.body));
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

export const exportQuestions: RequestHandler = async (req, res, next) => {
  try {
    const query = exportQuestionsQuerySchema.parse(req.query);
    // Fails here, before anything is written, if the result is too large.
    const { rows } = await questionService.exportQuestions(req.user!, query);

    res
      .type('text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="questions-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.write(questionExportService.csvHeader());
    for await (const q of rows) res.write(questionExportService.csvRow(q));
    res.end();
  } catch (err) {
    // Headers already sent: the download can't be turned into an error response, so cut it off.
    if (res.headersSent) res.destroy(err as Error);
    else next(err);
  }
};

export const updateQuestion:RequestHandler = async (req, res, next) => {
  try {
    const { id } = questionIdParamSchema.parse(req.params);
    res.json(await questionService.updateQuestion(req.user!, id, req.body));
  } catch (err) {
    next(err);
  }
};

export const getQuestion: RequestHandler = async (req, res, next) => {
  try {
    const { id } = questionIdParamSchema.parse(req.params);
    res.json(await questionService.getQuestion(req.user!, id));
  } catch (err) {
    next(err);
  }
};

export const approveQuestion: RequestHandler = async (req, res, next) => {
  try {
    const { id } = questionIdParamSchema.parse(req.params);
    res.json(await questionService.approveQuestion(req.user!, id));
  } catch (err) {
    next(err);
  }
};

export const requestChanges: RequestHandler = async (req, res, next) => {
  try {
    const { id } = questionIdParamSchema.parse(req.params);
    res.json(await questionService.requestChanges(req.user!, id, req.body));
  } catch (err) {
    next(err);
  }
};

export const rejectQuestion: RequestHandler = async (req, res, next) => {
  try {
    const { id } = questionIdParamSchema.parse(req.params);
    res.json(await questionService.rejectQuestion(req.user!, id, req.body));
  } catch (err) {
    next(err);
  }
};

export const countQuestions: RequestHandler = async (req, res, next) => {
  try {
    res.json(await questionService.countQuestions(req.user!));
  } catch (err) {
    next(err);
  }
};

export const getQuestionHistory: RequestHandler = async (req, res, next) => {
  try {
    const { id } = questionIdParamSchema.parse(req.params);
    res.json(await questionService.getQuestionHistory(req.user!, id));
  } catch (err) {
    next(err);
  }
};

export const listSubmissions: RequestHandler = async (req, res, next) => {
  try {
    const query = listSubmissionsQuerySchema.parse(req.query);
    res.json(await questionService.listSubmissions(req.user!, query));
  } catch (err) {
    next(err);
  }
};

export const importQuestions: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await questionImportService.importQuestions(req.user!, req.file!.buffer));
  } catch (err) {
    next(err);
  }
};

export const downloadImportTemplate: RequestHandler = (_req, res) => {
  res
    .type('text/csv')
    .set('Content-Disposition', 'attachment; filename="question-import-template.csv"')
    .send(questionImportService.IMPORT_TEMPLATE);
};
