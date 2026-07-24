/**
 * @NApiVersion 2.1
 */

define([
    'N/https'
], (
    https
) => {

    /**
     * Retrieves the current weight from a PrintNode scale endpoint.
     *
     * @param {Object} options
     * @param {string} options.url
     * @param {string} options.authorization
     *
     * @returns {number}
     */
    const getWeight = ({
        url,
        authorization
    }) => {
        requireValue(
            url,
            'The PrintNode endpoint is required.'
        );

        requireValue(
            authorization,
            'The PrintNode authorization header is required.'
        );

        const response = https.request({
            method: https.Method.GET,
            url,
            headers: {
                Authorization: authorization,
                Accept: 'application/json'
            }
        });

        const statusCode = Number(response.code);

        if (
            statusCode < 200 ||
            statusCode >= 300
        ) {
            throw new Error(
                `PrintNode returned HTTP ${statusCode}.`
            );
        }

        const responseBody = parseResponse(
            response.body
        );

        const weight = extractWeight(
            responseBody
        );

        log.audit({
            title: 'PrintNode scale response',
            details: {
                endpoint: url,
                weight
            }
        });

        return weight;
    };

    /**
     * Parses the JSON returned by PrintNode.
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
                'PrintNode returned an empty response.'
            );
        }

        try {
            return JSON.parse(body);

        } catch (error) {
            log.error({
                title: 'Invalid PrintNode response',
                details: body
            });

            throw new Error(
                'PrintNode returned invalid JSON.'
            );
        }
    };

    /**
     * Extracts and normalizes the weight from a PrintNode response.
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
                'PrintNode did not return a scale measurement.'
            );
        }

        let weight = Number(
            data[0].measurement.kg
        );

        if (!Number.isFinite(weight)) {
            throw new Error(
                'PrintNode returned an invalid weight.'
            );
        }

        /*
         * Some PrintNode scale responses may express kilograms
         * using a nanoscale value.
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
