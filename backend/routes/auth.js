const express = require('express');
const router = express.Router();
const { requiresAuth } = require('express-openid-connect');

// Check if user is authenticated and return user info
// Actualiza el endpoint check
router.get('/check', (req, res) => {
  try {
    // Intentar autenticación JWT primero
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secreto-temporal');
        return res.json({
          isAuthenticated: true,
          user: decoded
        });
      } catch (err) {
        console.log('Token inválido:', err.message);
      }
    }
    
    // Si falla JWT, usar sesión
    if (req.oidc.isAuthenticated()) {
      return res.json({
        isAuthenticated: true,
        user: req.oidc.user
      });
    }
    
    return res.json({ isAuthenticated: false });
  } catch (error) {
    console.error('Error checking auth:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;