import typescript from '@rollup/plugin-typescript';
import pkg from './package.json';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

const banner = `/**
 * ${pkg.name}
 * ${pkg.description}
 * @version: ${pkg.version}
 * @author: ${pkg.author}
 * @license: ${pkg.license}
 **/
`;

export default [
  {
    input: 'src/rnnoise.ts',
    plugins: [
      typescript({module: "esnext"}),
      commonjs(),
      resolve()
    ],
    output: {
      sourcemap: false,
      file: './dist/rnnoise.mjs',
      format: 'module',
      name: 'Shiguredo',
      extend: true,
      banner: banner,
    }
  },
];
