const shimmer = require('shimmer');
const tracer = require('../tracer.js');
const eventInterface = require('../event.js');
const moduleUtils = require('./module_utils.js');

/**
 * Wraps the publish command function with tracing
 * @param {Function} originalPublishFunc The wrapped function
 * from mqtt module
 * @returns {Function} The wrapped function
 */
function publishWrapper(originalPublishFunc) {
    return function internalPublishWrapper(topic, message, options, callback) {
        let patchedCallback = callback;

        try {
            const { slsEvent: mqttEvent, startTime } = eventInterface.initializeEvent('mqtt',
                topic,
                'publish',
                'mqtt');
            const responseMetadata = {
                region: this.options.region,
                protocol: this.options.protocol,
                host: this.options.host,
            };
            const payload = {
                clientId: this.options.clientId,
                protocolId: this.options.protocolId,
                protocolVersion: this.options.protocolVersion,
                message,
            };
            const promise = new Promise((resolve) => {
                patchedCallback = (err, ...rest) => {
                    eventInterface.finalizeEvent(
                        mqttEvent,
                        startTime,
                        err || null,
                        responseMetadata,
                        payload
                    );
                    if (callback) {
                        callback(err, ...rest);
                    }
                    resolve();
                };
            });
            tracer.addEvent(mqttEvent, promise);
        } catch (err) {
            tracer.addException(err);
        }

        return originalPublishFunc.apply(this, [topic, message, options, patchedCallback]);
    };
}

/**
 * Wraps the subscribe command function with tracing
 * @param {Function} originalSubscribeFunc The wrapped function
 * from mqtt module
 * @returns {Function} The wrapped function
 */
function subscribeWrapper(originalSubscribeFunc) {
    return function internalSubscribeWrapper(topic, options, callback) {
        let patchedCallback = callback;
        try {
            const { slsEvent: mqttEvent, startTime } = eventInterface.initializeEvent('mqtt',
                topic,
                'subscribe',
                'mqtt');
            const responseMetadata = {
                region: this.options.region,
                protocol: this.options.protocol,
                host: this.options.host,
            };
            const payload = {
                clientId: this.options.clientId,
                protocolId: this.options.protocolId,
                protocolVersion: this.options.protocolVersion,
            };
            const promise = new Promise((resolve) => {
                patchedCallback = (err, ...rest) => {
                    eventInterface.finalizeEvent(
                        mqttEvent,
                        startTime,
                        err || null,
                        responseMetadata,
                        payload
                    );
                    if (callback) {
                        callback(err, ...rest);
                    }
                    resolve();
                };
            });
            tracer.addEvent(mqttEvent, promise);
        } catch (err) {
            tracer.addException(err);
        }

        return originalSubscribeFunc.apply(this, [topic, options, patchedCallback]);
    };
}


/**
 * Wraps the constructor' command function
 * @param {Function} originalConstructorFunc The wrapped function
 * from mqtt module
 * @returns {Function} The wrapped function
 */
function mqttClientWrapper(originalConstructorFunc) {
    return function internalMqttClientWrapper(streamBuilder, options) {
        const mqttClient = originalConstructorFunc.apply(this, [streamBuilder, options]);
        try {
            shimmer.wrap(
                mqttClient,
                'publish',
                func => publishWrapper(func)
            );
            shimmer.wrap(
                mqttClient,
                'subscribe',
                func => subscribeWrapper(func)
            );
        } catch (error) {
            tracer.addException(error);
        }
        return mqttClient;
    };
}

module.exports = {
    /**
   * Initializes the MQTT tracer.
   */
    init() {
        moduleUtils.patchModule(
            'mqtt',
            'MqttClient',
            mqttClientWrapper,
            mqttModule => mqttModule
        );
    },
};