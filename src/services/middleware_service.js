/**
 * @NApiVersion 2.1
 */

define([
    'N/https'
], (
    https
) => {

    /**
     * Retrieves the current weight from a configured scale endpoint.
     *
     * @param {Object} options
     * @param {string} options.endpoint
     * @param {string} options.authorizationHeader
     *
     * @returns {number}
     */
    const getWeight = ({
        endpoint,
        authorizationHeader
    }) => {
        requireValue(
            endpoint,
            'The scale endpoint is required.'
        );

        requireValue(
            authorizationHeader,
            'The scale authorization header is required.'
        );

        const response = https.request({
            method: https.Method.GET,
            url: endpoint,
            headers: {
                Authorization: authorizationHeader,
                Accept: 'application/json'
            }
        });

        const statusCode = Number(
            response.code
        );

        if (
            statusCode < 200 ||
            statusCode >= 300
        ) {
            throw new Error(
                `The scale middleware returned HTTP ${statusCode}.`
            );
        }

        const responseBody = parseResponse(
            response.body
        );

        const weight = extractWeight(
            responseBody
        );

        log.audit({
            title: 'Scale Middleware Response',
            details: {
                endpoint,
                weight
            }
        });

        return weight;
    };

    /**
     * Parses the JSON returned by the scale middleware.
     *
     * Expected response:
     *
     * [
     *     {
     *         "measurement": {
     *             "kg": 1250
     *         }
     *     }
     * ]
     */
    const parseResponse = (body) => {
        if (!body) {
            throw new Error(
                'The scale middleware returned an empty response.'
            );
        }

        try {
            return JSON.parse(body);

        } catch (error) {
            log.error({
                title: 'Invalid Scale Middleware Response',
                details: body
            });

            throw new Error(
                'The scale middleware returned invalid JSON.'
            );
        }
    };

    /**
     * Extracts and normalizes the weight from the middleware response.
     *
     * @param {Array} data
     * @returns {number}
     */
    const extractWeight = (data) => {
        if (
            !Array.isArray(data) ||
            !data.length ||
            !data[0] ||
            !data[0].measurement
        ) {
            throw new Error(
                'The scale middleware did not return a measurement.'
            );
        }

        let weight = Number(
            data[0].measurement.kg
        );

        if (!Number.isFinite(weight)) {
            throw new Error(
                'The scale middleware returned an invalid weight.'
            );
        }

        /*
         * Some scale integrations may return kilograms
         * as a nanoscale value.
         */
        if (weight >= 1000000000) {
            weight /= 1000000000;
        }

        if (weight <= 0) {
            throw new Error(
                'The scale returned zero or a negative weight.'
            );
        }

        return weight;
    };

    /**
     * Validates required values.
     *
     * @param {*} value
     * @param {string} errorMessage
     */
    const requireValue = (
        value,
        errorMessage
    ) => {
        if (
            value === null ||
            value === undefined ||
            value === ''
        ) {
            throw new Error(errorMessage);
        }
    };

    return {
        getWeight
    };

});
