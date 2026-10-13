import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";

export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = crypto.randomBytes(8).toString("hex");
    const startedAt = Date.now();
    const method = req.method;
    const url = req.originalUrl || req.url;

    res.setHeader("X-Request-Id", requestId);
    console.log(
      `[${new Date().toISOString()}] ${method} ${url} requestId=${requestId}`,
    );

    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      console.log(
        `[${new Date().toISOString()}] ${method} ${url} requestId=${requestId} status=${res.statusCode} durationMs=${durationMs}`,
      );
    });

    next();
  };
}
