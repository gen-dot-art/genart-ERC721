// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
import "./GenArtAccess.sol";
import "./IGenArtPaymentSplitter.sol";

contract GenArtPaymentSplitter is GenArtAccess, IGenArtPaymentSplitter {
    struct Payment {
        address[] payees;
        uint256[] shares;
    }

    mapping(address => uint256) public _balances;
    mapping(address => Payment) private _payments;
    mapping(address => Payment) private _paymentsRoyalties;

    /**
     * @dev Throws if called by any account other than the owner, admin or collection contract.
     */
    modifier onlyCollectionContractOrAdmin(bool isCollection) {
        address sender = _msgSender();
        require(
            isCollection || owner() == sender || admins[sender],
            "GenArtAccess: caller is not the owner nor admin"
        );
        _;
    }

    function addCollectionPayment(
        address collection,
        address[] memory payees,
        uint256[] memory shares
    ) public override onlyAdmin {
        require(
            shares.length > 0 && shares.length == payees.length,
            "GenArtPaymentSplitter: invalid arguments"
        );

        _payments[collection] = Payment(payees, shares);
    }

    function addCollectionPaymentRoyalty(
        address collection,
        address[] memory payees,
        uint256[] memory shares
    ) public override onlyAdmin {
        require(
            shares.length > 0 && shares.length == payees.length,
            "GenArtPaymentSplitter: invalid arguments"
        );

        _paymentsRoyalties[collection] = Payment(payees, shares);
    }

    function splitPayment(address collection)
        public
        payable
        override
        onlyCollectionContractOrAdmin(
            _payments[msg.sender].payees[0] != address(0)
        )
    {
        uint256 totalShares = getTotalSharesOfCollection(collection, 0);
        for (uint8 i; i < _payments[collection].payees.length; i++) {
            address payee = _payments[collection].payees[i];
            uint256 ethAmount = (msg.value * _payments[collection].shares[i]) /
                totalShares;
            unchecked {
                _balances[payee] += ethAmount;
            }
        }
    }

    function splitPaymentRoyalty(address collection)
        public
        payable
        override
        onlyCollectionContractOrAdmin(
            _paymentsRoyalties[msg.sender].payees[0] != address(0)
        )
    {
        uint256 totalShares = getTotalSharesOfCollection(collection, 1);
        for (uint8 i; i < _paymentsRoyalties[collection].payees.length; i++) {
            address payee = _paymentsRoyalties[collection].payees[i];
            uint256 ethAmount = (msg.value *
                _paymentsRoyalties[collection].shares[i]) / totalShares;
            unchecked {
                _balances[payee] += ethAmount;
            }
        }
    }

    /**
     *@dev Get total shares of collection
     * - `_payment` pass "0" for _payments an "1" for _paymentsRoyalties
     */
    function getTotalSharesOfCollection(address collection, uint8 _payment)
        public
        view
        override
        returns (uint256)
    {
        Payment memory payment = _payment == 0
            ? _payments[collection]
            : _paymentsRoyalties[collection];
        require(
            payment.payees[0] != address(0),
            "GenArtPaymentSplitter: payment not found for collection"
        );
        uint256 totalShares;
        for (uint8 i; i < payment.shares.length; i++) {
            unchecked {
                totalShares += payment.shares[i];
            }
        }

        return totalShares;
    }

    function release(address account) public override {
        uint256 amount = _balances[account];
        require(amount > 0, "GenArtPaymentSplitter: no funds to release");
        _balances[account] = 0;
        payable(account).transfer(amount);
    }

    receive() external payable {}
}