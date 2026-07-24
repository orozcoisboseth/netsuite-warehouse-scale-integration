/**
 * @NApiVersion 2.1
 */

define([
    'N/record',
    'N/search',
    './middleware_service'
], (
    record,
    search,
    MiddlewareService
) => {

    /*
     * Generic custom record IDs used for the public repository.
     * Replace them with the IDs configured in your NetSuite account.
     *
     * Expected structure:
     *
     * customrecord_scale_configuration
     * ├── name
     * ├── isinactive
     * ├── custrecord_scale_endpoint
     * └── custrecord_scale_authorization
     */
    const CONFIG = {
        RECORD_TYPE:
            'customrecord_scale_configuration',

        FIELD_NAME:
            'name',

        FIELD_ENDPOINT:
            'custrecord_scale_endpoint',

        FIELD_AUTHORIZATION:
            'custrecord_scale_authorization'
    };

    /**
     * Returns all active scale configurations.
     *
     * This collection is used to populate the scale selector
     * displayed in the receiving Suitelet.
     *
     * @returns {Array<{
     *     id: string,
     *     name: string
     * }>}
     */
    const getAvailableScales = () => {
        const scales = [];

        const configurationSearch = search.create({
            type: CONFIG.RECORD_TYPE,

            filters: [
                [
                    'isinactive',
                    search.Operator.IS,
                    'F'
                ]
            ],

            columns: [
                search.createColumn({
                    name: CONFIG.FIELD_NAME,
                    sort: search.Sort.ASC
                })
            ]
        });

        configurationSearch.run().each((result) => {
            const configurationName =
                result.getValue({
                    name: CONFIG.FIELD_NAME
                });

            scales.push({
                id: String(result.id),

                name: String(
                    configurationName || result.id
                )
            });

            return true;
        });

        return scales;
    };

    /**
     * Loads the selected scale configuration and retrieves
     * the current weight through the middleware service.
     *
     * @param {Object} options
     * @param {string|number} options.scale
     *     Internal ID of the scale configuration record.
     * @param {string|number} [options.location]
     *     Selected receiving location. Included for logging and
     *     future location-based validation.
     *
     * @returns {number}
     */
    const getWeight = ({
        scale,
        location
    }) => {
        requireValue(
            scale,
            'Scale configuration ID is required.'
        );

        const configuration = loadConfiguration(
            scale
        );

        const configurationName =
            configuration.getValue({
                fieldId: CONFIG.FIELD_NAME
            });

        const endpoint =
            configuration.getValue({
                fieldId: CONFIG.FIELD_ENDPOINT
            });

        const authorizationHeader =
            configuration.getValue({
                fieldId: CONFIG.FIELD_AUTHORIZATION
            });

        requireValue(
            endpoint,
            `No endpoint is configured for scale ${
                configurationName || scale
            }.`
        );

        requireValue(
            authorizationHeader,
            `No authorization header is configured for scale ${
                configurationName || scale
            }.`
        );

        const weight =
            MiddlewareService.getWeight({
                endpoint,
                authorizationHeader
            });

        log.audit({
            title: 'Scale Weight Captured',
            details: {
                scaleConfigurationId:
                    String(scale),

                configurationName:
                    String(
                        configurationName || ''
                    ),

                receivingLocation:
                    location
                        ? String(location)
                        : null,

                weight
            }
        });

        return weight;
    };

    /**
     * Loads and validates an active scale configuration.
     *
     * @param {string|number} configurationId
     * @returns {record.Record}
     */
    const loadConfiguration = (
        configurationId
    ) => {
        let configuration;

        try {
            configuration = record.load({
                type: CONFIG.RECORD_TYPE,
                id: configurationId,
                isDynamic: false
            });

        } catch (error) {
            log.error({
                title:
                    'Unable to Load Scale Configuration',
                details: {
                    configurationId,
                    error
                }
            });

            throw new Error(
                'The selected scale configuration could not be loaded.'
            );
        }

        const isInactive =
            configuration.getValue({
                fieldId: 'isinactive'
            });

        if (
            isInactive === true ||
            isInactive === 'T'
        ) {
            throw new Error(
                'The selected scale configuration is inactive.'
            );
        }

        return configuration;
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
        getAvailableScales,
        getWeight
    };

});
