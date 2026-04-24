const express = require('express');
const controller = require('../controllers/mock.controller');

const router = express.Router();

router.get('/order-flow', controller.orderFlow);

module.exports = router;
