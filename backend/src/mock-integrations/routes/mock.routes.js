const express = require('express');
const controller = require('../controllers/mock.controller');

const router = express.Router();

router.post('/zomato/order', controller.zomatoOrder);
router.post('/swiggy/order', controller.swiggyOrder);
router.post('/payment', controller.payment);
router.post('/whatsapp', controller.whatsapp);
router.post('/tally', controller.tally);

module.exports = router;
