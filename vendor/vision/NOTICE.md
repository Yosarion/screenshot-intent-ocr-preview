# Local image classifier assets

ONNX Runtime Web 1.30.0 (MIT), Microsoft and contributors. See LICENSE_ONNX.txt and THIRD_PARTY_NOTICES.txt.

MobileNetV4 conv small e2400 ImageNet-1k, trained by Ross Wightman (timm; Apache-2.0). ONNX conversion by onnx-community/Xenova. Model source revision: 3ba07f12712fa58fd6b3d661f9909c9e332c5005. Original model card: https://huggingface.co/timm/mobilenetv4_conv_small.e2400_r224_in1k . See LICENSE_MODEL.txt.

FP32 was selected after the downloaded q8 variants failed control images. These assets classify ImageNet objects, not identities, exact products, brands, prices or user intent. Runtime is single-thread CPU WASM; no cloud image API.
