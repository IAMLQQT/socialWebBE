/* eslint-disable camelcase */

const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Sequelize = require('sequelize');
const axios = require('axios');
const {nanoid}  = require('nanoid');
const sendEmail = require('../utils/email');
const { user, account } = require('../models/models');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const { gt } = Sequelize.Op;
const signToken = (id, passwordVersion, ...info) =>
  jwt.sign({ id, passwordVersion, ...info }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
function generateRandomPassword(length) {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const passwordArray = new Array(length);

  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(characters.length);
    passwordArray[i] = characters.charAt(randomIndex);
  }

  return passwordArray.join('');
}

exports.protect = catchAsync(async (req, res, next) => {
  let token;

  // Lấy token từ header authorization
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
    console.log(token);
  }

  // Nếu không có token, trả về lỗi
  if (!token) {
    return next(new AppError('You are not allowed to access this. Please log in', 401));
  }

  // Giải mã token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  const accountID = decoded.id;

  // Tìm account từ database
  const currentAccount = await account.findOne({ where: { accountID: accountID } });

  // Nếu không tìm thấy account hoặc account bị khóa, trả về lỗi
  if (!currentAccount || currentAccount.account_status === 1) {
    return next(new AppError('Account no longer exists', 401));
  }

  // Kiểm tra thời gian thay đổi mật khẩu
  const timestamp = currentAccount.passwordChangeAt;
  if (timestamp && timestamp > decoded.iat) {
    return next(new AppError('Account changed password. Please log in again', 401));
  }
  if (
    timestamp > decoded.iat ||
    decoded.passwordVersion !== currentUser.passwordVersion
  )
  // Gán account vào request
  req.account = currentAccount;
  console.log(currentAccount);
  next();
});

exports.restrictTo =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.account.RoleID)) {
      return next(
        new AppError('You do not have permission to access this!', 403),
      );
    }
  };

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }
  const userInfo = await account.findOne({ where: { email: email } });

  if (
    !userInfo ||
    !(await userInfo.checkPassword(password, userInfo.password))
  ) {
    return next(new AppError('Incorrect email or password', 401));
  }
  //check if user is active
  if (!userInfo.account_status)
    return next(new AppError('This account was deactivated!', 401));
  //if everything ok, send token to client
  const token = signToken(userInfo.accountID);
  //Seend cookie
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000,
    ),
    httpOnly: false,
  };
  if (process.env.NODE_ENV === 'production') {
    cookieOptions.secure = true;
  }

  res.cookie('jwt', token, cookieOptions);

  res.status(200).json({
    status: 'success',
    token,
  });
});
exports.googleSignIn = catchAsync(async (req, res, next) => {
  const { tokenId } = req.body;
  try {
    // Verify the Google token with Google API
    const googleResponse = await axios.post(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${tokenId}`,
    );

    const { sub, email, given_name, family_name, picture } =
      googleResponse.data;

    // if (!email.includes('@husc.edu.vn')) {
    //   res.status(400).json({
    //     status: 'failed',
    //     message: 'Please use education email (HUSC).',
    //   });
    //   return next(new AppError('Please use education email (HUSC).', 400));
    // }
    const existingAccount = await account.findOne({ where: { email: email } });
    
    if (!existingAccount) {
      const initialPassword = generateRandomPassword(8);
       // Create new account in Accounts table
       const newAccount = await account.create({
        accountID: sub, // Assuming 'sub' is used as accountID
        email: email,
        password: initialPassword,
        account_status: true,
        RoleID: '1111111111', 
      });

      // Create new user in Users table
      const newUser = {
        user_id: nanoid(15),
        first_name: given_name,
        last_name: family_name,
        profile_picture: picture,
        accountID: newAccount.accountID, 
      };

      await user.create(newUser);
      const message = `Dear ${newUser.first_name} ${newUser.last_name},

      Welcome to our platform! Your account has been successfully created. Please use the following password to login: ${initialPassword}

      Please note that this is your initial password, and we highly recommend changing it after logging in for the first time.

      If you have any questions or need further assistance, please feel free to contact our support team.

      Best regards,
      PTIT Student Information Exchange Platform
      `;

      await sendEmail({
        email: newAccount.email,
        subject: '[PTIT] Welcome to PTIT Social Web - Initial Password',
        message,
      });
      res.status(200).json({ status: 'success' });
    } else {
      return res
        .status(401)
        .json({ status: 'failed', message: 'This email is already in use!' });
    }
  } catch (error) {
    console.error('Google Sign-In failed:', error);
    res.status(401).json({ error: 'Google Sign-In failed' });
  }
});

exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  const Accountinfo = await account.findOne({ where: { email: email } });

  if (!Accountinfo) {
    return next(new AppError('Email address is not  d!', 400));
  }
  const resetToken = Accountinfo.createPasswordResetToken();

  await Accountinfo.save();
  //3 send to email
  const resetURL = `${process.env.WEB_DOMAIN}/resetPassword/${resetToken}`;
  const message = `Dear ${Accountinfo.first_name},\n\nWe received a request to reset your password. If you did not initiate this request, please ignore this email.\n\nTo reset your password, please click on the following link:\n\n${resetURL}\n\nThis link is valid for 10 minutes.\n\nThank you,\nThe Social Web Team`;

  try {
    await sendEmail({
      email: Accountinfo.email,
      subject: '[PTIT] Your password reset token (valid for 10 min)',
      message,
    });

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!',
    });
  } catch (err) {
    Accountinfo.passwordResetToken = undefined;
    Accountinfo.passwordResetExpires = undefined;
    await Accountinfo.save();

    return next(
      new AppError('There was an error sending the email. Try again later!'),
      500,
    );
  }
});
exports.resetPassword = catchAsync(async (req, res, next) => {
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await Users.findOne({
    where: {
      passwordResetToken: hashedToken,
      passwordResetExpires: {
        [gt]: Date.now(),
      },
    },
  });
  if (!user) {
    return next(
      new AppError('Invalid token or token has already expired!', 401),
    );
  }
  user.password = req.body.password;
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  await user.save();

  res.status(200).json({
    status: 'success',
    message: 'Password changed successfully',
  });
});
exports.updatePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  const user = await Users.findOne({ where: { user_id: req.user.user_id } });
  if (!user) return next(new AppError("Can't found this user", 400));
  const check = await user.checkPassword(currentPassword, user.password);
  if (!check) return next(new AppError('Password is not correct!!!', 401));
  user.password = newPassword;
  user.passwordChangedAt = Date.now();
  user.passwordVersion += 1;
  await user.save();
  res.status(200).json({ message: 'password changed successfully' });
});
exports.deactivateUser = catchAsync(async (req, res, next) => {
  const user = await Users.findOne({
    where: {
      user_id: req.user.user_id,
    },
  });

  await user.update({ is_active: 0 });
  res
    .status(200)
    .json({ status: 'success', message: 'Deactive successfully.' });
});

exports.verifyToken = async (token) => {
  if (!token) return null;
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  const user_id = decoded.id;
  const currentUser = await Users.findOne({ where: { user_id: user_id } });
  if (!currentUser || currentUser.is_active === 1) {
    console.log('fail 1');
    return null;
  }
  const timestamp = currentUser.passwordChangeAt;
  if (
    timestamp > decoded.iat ||
    decoded.passwordVersion !== currentUser.passwordVersion
  ) {
    console.log('fail 2');
    return null;
  }

  return currentUser.get({ plain: true });
};
