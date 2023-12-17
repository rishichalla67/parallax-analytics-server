function notFound(req, res, next) {
  res.status(404).json({
    status: 'error',
    message: 'The requested resource was not found.'
  });
}

function errorHandler(err, req, res, next) {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    status: 'error',
    message: statusCode === 500 ? 'An unexpected error occurred.' : err.message
  });
}

module.exports = {
  notFound,
  errorHandler,
};
