const express = require('express');
const router = express.Router();
const { requiresAuth } = require('express-openid-connect');

// Check if user is authenticated and return user info
router.get('/check', (req, res) => {
  if (req.oidc.isAuthenticated()) {
    return res.json({
      isAuthenticated: true,
      user: req.oidc.user
    });
  }
  
  return res.json({
    isAuthenticated: false
  });
});

module.exports = router;