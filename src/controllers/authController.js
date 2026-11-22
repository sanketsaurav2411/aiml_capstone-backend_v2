const { signToken } = require('../lib/jwt');
const { AppError } = require('../lib/errors');
const { verifyCredentials, registerUser, getUserById, serializeUser } = require('../services/authService');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await verifyCredentials(email, password);

    if (!user) {
      return next(new AppError('Invalid email or password', 401));
    }

    const token = signToken({ sub: user.id, email: user.email, name: user.name });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: serializeUser(user),
        token,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function register(req, res, next) {
  try {
    const { name, email, company, password } = req.body;
    const user = await registerUser({ name, email, company, password });
    if (!user) {
      return next(new AppError('An account with this email already exists', 409));
    }
    const token = signToken({ sub: user.id, email: user.email, name: user.name });
    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: serializeUser(user),
        token,
      },
    });
  } catch (error) {
    return next(error);
  }
}

function logout(req, res) {
  return res.status(200).json({
    success: true,
    message: 'Logout successful',
  });
}

async function getMe(req, res, next) {
  try {
    const user = await getUserById(req.user.sub);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({
      success: true,
      data: {
        user: serializeUser(user),
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  login,
  register,
  logout,
  getMe,
};
