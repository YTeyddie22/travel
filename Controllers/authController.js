const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const User = require("../Models/User");
const catchAsync = require("./../utils/catchAsync");
const AppError = require("./../utils/appError");
const sendMail = require("./../utils/email");

//* Refactored JWT sign function.

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

//? Refactored signToken;

const createSignedToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  //* Setting the cookie options
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };

  //*CHecking the environment to secure the cookie;
  if (process.env.NODE_ENV === "production") cookieOptions.secure = true;

  //* Init a cookie;
  res.cookie("jwt", token, cookieOptions);

  //* Removing the password from being seen in body
  user.password = undefined;

  res.status(statusCode).json({
    status: "success",
    token,
    data: {
      user,
    },
  });
};

//! SignUp function
exports.signup = catchAsync(async function (req, res, next) {
  //* Signing up a new user

  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    role: req.body.role,
  });

  createSignedToken(newUser, 201, res);
});

//! for Logging in

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password)
    return next(new AppError(`Enter both password and email`, 400));

  const user = await User.findOne({ email }).select("+password");

  //* Check the !correct password for the user.
  if (!user || !(await user.correctPassword(password, user.password)))
    return next(new AppError(` Incorrect email or password`, 401));

  createSignedToken(user, 200, res);
});

//! Protecting the password data
exports.protect = catchAsync(async (req, res, next) => {
  //*1 Get token and check if it is present
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(
      new AppError(`You are not logged in. Confirm Passwords are the same`, 401)
    );
  }

  //* 2 Verifying the token.

  //TODO
  const decoder = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  //*3 Check if the user still exists in the app or changed password.

  const decodedCurrentUserId = await User.findById(decoder.id);

  if (!decodedCurrentUserId) {
    return next(new AppError("The user by this ID no longer exists", 401));
  }

  //*4 Check whether password changed after issuing of token

  if (decodedCurrentUserId.changedPasswordAfter(decoder.iat)) {
    return next(new AppError("The user changed his/her ID recently!", 401));
  }

  //* Allow access to app;

  req.user = decodedCurrentUserId;

  next();
});

//* Authorization to some functionality.

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("You do not have permission for this operation ", 403)
      );
    }
    next();
  };
};

//* Forgetting password and sending it to email address

exports.forgotPassword = catchAsync(async (req, res, next) => {
  //? 1 Get the user based on posted email address

  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return next(new AppError("There is no user of the email address!", 404));
  }

  //? 2. Generate token from model.

  const resetToken = user.createPasswordResetToken();

  await user.save({ validateBeforeSave: false });

  //? 3. Send token to email address

  const resetUrl = `${req.protocol}://${req.get(
    "host"
  )}/api/v1/users/resetPassword/${resetToken}`;

  //?4 Response message incase of success when await the promise.

  const responseMessage = `Forgot your password? Patch your new authenticated password to. ${resetUrl}\n You can also ignore the message if you did not forget`;

  try {
    await sendMail({
      email: user.email,
      subject: " The reset token (valid for 10 minutes)",
      responseMessage,
    });

    res.status(200).json({
      status: "success",
      message: "Token is sent to email",
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError(
        "There was an error sending the email. Try some time later",
        500
      )
    );
  }
});

//! Resetting the password;

exports.resetPassword = catchAsync(async (req, res, next) => {
  //*1 Get the user based on token;
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  //*2 Set new password only if there is a user and the token is not expired;

  if (!user) {
    return next(new AppError("The Token is invalid or expired", 400));
  }

  user.password = req.body.password;
  user.confirmPassword = req.body.confirmPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();

  //*3 update the changedPassword on the user;

  //*4 Login the user;

  createSignedToken(user, 200, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  //* 1  Get the user from the collection

  const user = await User.findById(req.user.id).select("+password");

  //* 2 Check validation of the password

  if (!(await user.correctPassword(req.body.currentPassword, user.password))) {
    return next(new AppError("Incorrect password", 401));
  }

  //* 3 Update the password

  user.password = req.body.password;
  user.confirmPassword = req.body.confirmPassword;

  await user.save();

  //* 4 Send the signed token using JWT and sign in the user;

  createSignedToken(user, 200, res);

  console.log(user.password);
});
