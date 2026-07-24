/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */

define(['N/url'], (url) => {

    /**
     * Redirects the user to the Receive Lots Suitelet.
     *
     * @param {number|string} purchaseOrderId
     */
    const openReceiving = (purchaseOrderId) => {

        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_sl_receive_lots',
            deploymentId: 'customdeploy_sl_receive_lots',
            params: {
                poid: purchaseOrderId
            }
        });

        window.location.assign(suiteletUrl);

    };

    return {
        openReceiving
    };

});
