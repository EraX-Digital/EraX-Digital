// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Checks that a creator metadata URI is a bounded https or ipfs reference.
/// @dev The URI points at off-chain profile data. This contract does not fetch or store that data.
library MetadataUri {
    uint256 internal constant MAX_LENGTH = 2048;

    error EmptyMetadata();
    error MetadataTooLong(uint256 length);
    error InvalidMetadata();

    /// @notice Reverts unless `uri` is an https or ipfs URI within the length limit and without whitespace.
    function validate(string calldata uri) internal pure {
        bytes calldata data = bytes(uri);
        uint256 length = data.length;
        if (length == 0) revert EmptyMetadata();
        if (length > MAX_LENGTH) revert MetadataTooLong(length);
        if (!_hasPrefix(data, "https://") && !_hasPrefix(data, "ipfs://")) revert InvalidMetadata();
        for (uint256 i = 0; i < length; ++i) {
            bytes1 char = data[i];
            // Reject the first illegal byte instead of scanning a URI that cannot be stored.
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (char <= 0x20 || char == 0x7f) revert InvalidMetadata();
        }
    }

    function _hasPrefix(bytes calldata data, bytes memory prefix) private pure returns (bool) {
        uint256 prefixLength = prefix.length;
        if (data.length < prefixLength) return false;
        for (uint256 i = 0; i < prefixLength; ++i) {
            if (data[i] != prefix[i]) return false;
        }
        return true;
    }
}
