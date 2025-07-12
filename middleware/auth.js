const jwt = require('jsonwebtoken');

exports.authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ success: false, message: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: "Invalid token" });

    req.user = user;
    next();
  });
};
