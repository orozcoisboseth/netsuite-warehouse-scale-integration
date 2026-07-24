/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */

define([], () => {

    const beforeLoad = (context) => {

        // Solo al visualizar
        if (context.type !== context.UserEventType.VIEW) {
            return;
        }

        // Solo Purchase Orders
        if (context.newRecord.type !== 'purchaseorder') {
            return;
        }

        const po = context.newRecord;
        const orderStatus = po.getValue('orderstatus');

        // Pending Receipt o Partially Received
        if (!['B', 'D'].includes(orderStatus)) {
            return;
        }

        context.form.clientScriptModulePath = './cs_receive_lots.js';

        context.form.addButton({
            id: 'custpage_receive_lots',
            label: 'Receive Lots',
            functionName: `openReceiving(${po.id})`
        });

    };

    return {
        beforeLoad
    };

});
