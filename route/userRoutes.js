const express = require("express");

const {
  getAllUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
} = require("./../Controllers/usersController");

//* Router for authentication and login
const {
  signup,
  login,
  forgotPassword,
  resetPassword,
} = require("./../Controllers/authController");

//!Users

const router = express.Router();

//* SignUp Router
router.post("/signup", signup);

//* Login router
router.post("/login", login);

//* Routes for forgetting password and resetting via email.
router.post("/forgotpassword", forgotPassword);
router.patch("/resetpassword/:token", resetPassword);

router.route("/").get(getAllUsers).post(createUser);
router.route("/:id").get(getUser).patch(updateUser).delete(deleteUser);

module.exports = router;
