import {
  assert,
  Bool,
  Bytes,
  Field,
  PublicKey,
  Signature,
  Struct,
  Undefined,
  VerificationKey,
  type ProvablePure,
} from 'o1js';
import type { ExcludeFromRecord } from './types.ts';
import {
  type InferProvableType,
  type ProvablePureType,
  ProvableType,
} from './o1js-missing.ts';

/**
 * TODO: program spec must be serializable
 * - can be done by defining an enum of supported base types
 */

export type { Node, PublicInputs, UserInputs };
export { Spec, Attestation, Operation, Input };

type Spec<
  Data = any,
  Inputs extends Record<string, Input> = Record<string, Input>
> = {
  inputs: Inputs;
  logic: OutputNode<Data>;
};

/**
 * Specify a ZkProgram that verifies and selectively discloses data
 */
function Spec<Data, Inputs extends Record<string, Input>>(
  inputs: Inputs,
  spec: (inputs: {
    [K in keyof Inputs]: Node<GetData<Inputs[K]>>;
  }) => OutputNode<Data>
): Spec<Data, Inputs> {
  let rootNode = root(inputs);
  let inputNodes: {
    [K in keyof Inputs]: Node<GetData<Inputs[K]>>;
  } = {} as any;
  for (let key in inputs) {
    inputNodes[key] = property(rootNode, key) as any;
  }
  return { inputs, logic: spec(inputNodes) };
}

const Undefined_: ProvablePure<undefined> = Undefined;

/**
 * An attestation is:
 * - a string fully identifying the attestation type
 * - a type for public parameters
 * - a type for private parameters
 * - a type for data (which is left generic when defining attestation types)
 * - a function `verify(publicInput: Public, privateInput: Private, data: Data)` that asserts the attestation is valid
 */
type Attestation<Id extends string, Public, Private, Data> = {
  type: Id;
  public: ProvablePureType<Public>;
  private: ProvableType<Private>;
  data: ProvablePureType<Data>;

  verify(publicInput: Public, privateInput: Private, data: Data): void;
};

function defineAttestation<
  Id extends string,
  PublicType extends ProvablePureType,
  PrivateType extends ProvableType
>(config: {
  type: Id;
  public: PublicType;
  private: PrivateType;

  verify<DataType extends ProvablePureType>(
    publicInput: InferProvableType<PublicType>,
    privateInput: InferProvableType<PrivateType>,
    dataType: DataType,
    data: InferProvableType<DataType>
  ): void;
}): <DataType extends ProvablePureType>(
  data: DataType
) => Attestation<
  Id,
  InferProvableType<PublicType>,
  InferProvableType<PrivateType>,
  InferProvableType<DataType>
> {
  return function attestation(dataType) {
    return {
      type: config.type,
      public: config.public,
      private: config.private,
      data: dataType,
      verify(publicInput, privateInput, data) {
        return config.verify(publicInput, privateInput, dataType, data);
      },
    };
  };
}

// dummy attestation with no proof attached
const ANone = defineAttestation({
  type: 'attestation-none',
  public: Undefined_,
  private: Undefined_,
  verify() {
    // do nothing
  },
});

// native signature
const ASignature = defineAttestation({
  type: 'attestation-signature',
  public: PublicKey, // issuer public key
  private: Signature,

  // verify the signature
  verify(issuerPk, signature, type, data) {
    let ok = signature.verify(issuerPk, ProvableType.get(type).toFields(data));
    assert(ok, 'Invalid signature');
  },
});

// TODO recursive proof
const AProof = defineAttestation({
  type: 'attestation-proof',
  // TODO include hash of public inputs of the inner proof
  // TODO maybe names could be issuer, credential
  public: Field, // the verification key hash (TODO: make this a `VerificationKey` when o1js supports it)
  private: Struct({
    vk: VerificationKey, // the verification key
    proof: Undefined_, // the proof, TODO: make this a `DynamicProof` when o1js supports it, or by refactoring our provable type representation
  }),

  verify(vkHash, { vk, proof }, _type, data) {
    vk.hash.assertEquals(vkHash);
    // proof.verify(vk);
    // TODO we also need to somehow ensure that the proof's output type matches the data type
    // proof.publicOutput.assertEquals(data);
    throw Error('Proof attestation not implemented');
  },
});

const Attestation = {
  none: ANone,
  proof: AProof,
  signature: ASignature,
};

const Input = {
  public: publicParameter,
  private: privateParameter,
  constant,
};

const Operation = {
  property,
  equals,
  and,
};

type Constant<Data> = {
  type: 'constant';
  data: ProvableType<Data>;
  value: Data;
};
type Public<Data> = { type: 'public'; data: ProvablePureType<Data> };
type Private<Data> = { type: 'private'; data: ProvableType<Data> };

type Input<Data = any> =
  | Attestation<string, any, any, Data>
  | Constant<Data>
  | Public<Data>
  | Private<Data>;

type Node<Data = any> =
  | { type: 'dummy'; data: Data } // this is just there so that the type param is used, for inference
  | { type: 'root'; input: Record<string, Input> }
  | { type: 'property'; key: string; inner: Node }
  | { type: 'equals'; left: Node; right: Node }
  | { type: 'and'; left: Node<Bool>; right: Node<Bool> };

type OutputNode<Data = any> = {
  assert?: Node<Bool>;
  data?: Node<Data>;
};

type GetData<T extends Input> = T extends Input<infer Data> ? Data : never;

function constant<DataType extends ProvableType>(
  data: DataType,
  value: InferProvableType<DataType>
): Constant<InferProvableType<DataType>> {
  return { type: 'constant', data, value };
}

function publicParameter<DataType extends ProvablePureType>(
  data: DataType
): Public<InferProvableType<DataType>> {
  return { type: 'public', data };
}

function privateParameter<DataType extends ProvableType>(
  data: DataType
): Private<InferProvableType<DataType>> {
  return { type: 'private', data };
}

// Node constructors

function root<Inputs extends Record<string, Input>>(
  inputs: Inputs
): Node<{ [K in keyof Inputs]: Node<GetData<Inputs[K]>> }> {
  return { type: 'root', input: inputs };
}

function property<K extends string, Data extends { [key in K]: any }>(
  node: Node<Data>,
  key: K
): Node<Data[K]> {
  return { type: 'property', key, inner: node as Node<any> };
}

function equals<Data>(left: Node<Data>, right: Node<Data>): Node<Bool> {
  return { type: 'equals', left, right };
}

function and(left: Node<Bool>, right: Node<Bool>): Node<Bool> {
  return { type: 'and', left, right };
}

// TODO remove
// small inline test

const isMain = import.meta.filename === process.argv[1];
if (isMain) {
  const Bytes32 = Bytes(32);
  const InputData = Struct({ age: Field, name: Bytes32 });

  const spec = Spec(
    {
      signedData: Attestation.signature(InputData),
      targetAge: Input.public(Field),
      targetName: Input.constant(Bytes32, Bytes32.fromString('Alice')),
    },
    ({ signedData, targetAge, targetName }) => ({
      assert: Operation.and(
        Operation.equals(Operation.property(signedData, 'age'), targetAge),
        Operation.equals(Operation.property(signedData, 'name'), targetName)
      ),
      data: Operation.property(signedData, 'age'),
    })
  );
  console.log(spec);

  // public inputs, extracted at the type level
  type specPublicInputs = PublicInputs<typeof spec.inputs>;

  // user inputs to the program
  type specUserInputs = UserInputs<typeof spec.inputs>;
}

type PublicInputs<InputTuple extends Record<string, Input>> = ExcludeFromRecord<
  MapToPublic<InputTuple>,
  never
>;

type UserInputs<InputTuple extends Record<string, Input>> = ExcludeFromRecord<
  MapToUserInput<InputTuple>,
  never
>;

type MapToPublic<T extends Record<string, Input>> = {
  [K in keyof T]: ToPublic<T[K]>;
};

type MapToUserInput<T extends Record<string, Input>> = {
  [K in keyof T]: ToUserInput<T[K]>;
};

type ToPublic<T extends Input> = T extends Attestation<
  string,
  infer Public,
  any,
  any
>
  ? Public
  : T extends Public<infer Data>
  ? Data
  : never;

type ToUserInput<T extends Input> = T extends Attestation<
  string,
  infer Public,
  infer Private,
  infer Data
>
  ? { public: Public; private: Private; data: Data }
  : T extends Public<infer Data>
  ? Data
  : T extends Private<infer Data>
  ? Data
  : never;
